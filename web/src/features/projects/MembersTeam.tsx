import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProjectRole, TeamMemberViewModel } from '@/contracts'
import { describeError, projectTeamService } from '@/data'
import {
  Avatar,
  LoadFailed,
  LoadingRows,
  personName,
  ROLE_OPTIONS,
  roleName,
} from '@/features/projects/membersParts'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Select } from '@/shared/components/Select'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { formatRelative } from '@/shared/lib/datetime'

/** A partir de quantas pessoas a busca aparece: ate oito, a lista cabe numa olhada. */
export const SEARCH_FROM = 9

/** O time lido da API, com a copia local que mudar papel e remover editam. */
export interface TeamState {
  members: TeamMemberViewModel[] | null
  setMembers: Dispatch<SetStateAction<TeamMemberViewModel[] | null>>
  loading: boolean
  failed: boolean
  reload: () => void
}

/**
 * O time mora na tela, e nao na aba: a contagem da aba e a conferencia do convite
 * ("ja esta no time") leem a mesma lista que a aba desenha.
 */
export function useTeam(projectPublicId: string): TeamState {
  const { data, loading, failed, reload } = useAsyncResource(
    useCallback(() => projectTeamService.listMembers(projectPublicId), [projectPublicId]),
  )

  // Copia local: mudar o papel ou remover nao traz o esqueleto de volta.
  const [members, setMembers] = useState<TeamMemberViewModel[] | null>(null)
  useEffect(() => setMembers(data), [data])

  return { members, setMembers, loading, failed, reload }
}

/** Dono, depois quem administra, depois o resto — na ordem da API dentro de cada grupo. */
function rank(member: TeamMemberViewModel): number {
  if (member.IsAccountOwner) return 0
  return member.Role === 'Administrator' ? 1 : 2
}

/** Sem acento e sem caixa: "jose" acha "José". */
function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function TeamSection({
  projectPublicId,
  team,
  admin,
  inTab,
}: {
  projectPublicId: string
  team: TeamState
  admin: boolean
  /** Dentro da aba, o titulo e a propria aba: ele fica so para o leitor de tela e a ancora. */
  inTab: boolean
}) {
  const navigate = useNavigate()
  const loadProjects = useProjectsStore((state) => state.load)
  const { members, setMembers, loading, failed, reload } = team

  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<TeamMemberViewModel | null>(null)
  const [changing, setChanging] = useState<string | null>(null)
  /** Quem administra escolheu deixar de administrar: pergunta antes de valer. */
  const [demoting, setDemoting] = useState<TeamMemberViewModel | null>(null)

  /**
   * Tirar o proprio papel de administrador **pergunta antes**. E raro, e sem volta
   * para quem faz: a configuracao some na hora, e so outra pessoa que administra
   * devolve o papel.
   */
  function pickRole(member: TeamMemberViewModel, role: ProjectRole) {
    if (member.IsYou && member.Role === 'Administrator' && role === 'Member') {
      setDemoting(member)
      return
    }
    void changeRole(member, role)
  }

  async function changeRole(member: TeamMemberViewModel, role: ProjectRole, undoing = false) {
    if (role === member.Role) return
    setChanging(member.UserPublicId)

    try {
      const updated = await projectTeamService.changeMemberRole(
        projectPublicId,
        member.UserPublicId,
        { Role: role },
      )
      setMembers((list) =>
        (list ?? []).map((item) => (item.UserPublicId === updated.UserPublicId ? updated : item)),
      )

      const name = personName(member)
      const now = roleName(updated.Role).toLowerCase()
      if (undoing) {
        toast.done(`${name} voltou a ser ${now}.`)
      } else if (member.IsYou) {
        // O proprio papel nao tem desfazer: quem deixou de administrar nao muda mais papel.
        toast.done('Papel alterado.')
      } else {
        // O papel muda num clique da caixa, sem confirmar: o desfazer e a rede do clique errado.
        toast.done(`${name} agora é ${now}.`, {
          action: { label: 'Desfazer', run: () => void changeRole(updated, member.Role, true) },
        })
      }

      // O proprio papel mudou: a lateral precisa saber se a Configuracao continua
      // aparecendo.
      if (member.IsYou) await loadProjects()
    } catch (failure) {
      toast.error(describeError(failure))
    } finally {
      setChanging(null)
    }
  }

  async function remove(member: TeamMemberViewModel) {
    try {
      await projectTeamService.removeMember(projectPublicId, member.UserPublicId)

      // Quem sai e a propria pessoa: o projeto deixou de ser dela.
      if (member.IsYou) {
        await loadProjects()
        navigate('/projects')
        return
      }

      setMembers((list) => (list ?? []).filter((item) => item.UserPublicId !== member.UserPublicId))
      toast.done(`${personName(member)} saiu do time.`)
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  const searchable = members !== null && members.length >= SEARCH_FROM
  const needle = searchable ? plain(query.trim()) : ''
  const shown =
    members === null
      ? null
      : [...members]
          .sort((a, b) => rank(a) - rank(b))
          .filter(
            (member) =>
              needle.length === 0 ||
              plain(`${member.Name ?? ''} ${member.Email ?? ''}`).includes(needle),
          )

  return (
    <section aria-labelledby="time-do-projeto">
      <h2 id="time-do-projeto" className={inTab ? 'sr-only' : 'mb-3 font-semibold text-lead'}>
        Time
        {!inTab && members !== null && (
          <>
            {' '}
            <span className="font-normal text-fg-muted tabular-nums">{`· ${members.length}`}</span>
          </>
        )}
      </h2>

      {failed && (
        <LoadFailed
          text="Não deu para carregar o time agora. Ninguém saiu do projeto por causa disso."
          onRetry={reload}
        />
      )}

      {loading && <LoadingRows />}

      {members !== null && searchable && (
        <TextField
          className="mb-3 max-w-80"
          ariaLabel="Buscar no time"
          placeholder="Buscar por nome ou e-mail"
          value={query}
          onChange={setQuery}
          maxLength={100}
        />
      )}

      {shown !== null && shown.length === 0 && needle.length > 0 && (
        <p className="rounded-lg border border-border border-dashed px-3.5 py-3 text-detail text-fg-muted">
          Ninguém no time com “{query.trim()}”.
        </p>
      )}

      {/* Uma lista so, com divisorias: um cartao por pessoa fazia quatro pessoas
          parecerem quatro avisos. */}
      {shown !== null && shown.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface-raised">
          {shown.map((member) => (
            <MemberRow
              key={member.UserPublicId}
              member={member}
              admin={admin}
              changing={changing === member.UserPublicId}
              onPickRole={(role) => pickRole(member, role)}
              onRemove={() => setRemoving(member)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={
          removing?.IsYou
            ? 'Sair do time?'
            : `Remover ${removing ? personName(removing) : 'esta pessoa'} do time?`
        }
        description={
          removing?.IsYou
            ? 'Você perde o acesso a este projeto agora. Para voltar, alguém que administra precisa convidar você de novo.'
            : 'A pessoa perde o acesso a este projeto na próxima vez que abrir o painel. O que ela escreveu nos relatos continua com o nome dela.'
        }
        confirmLabel={removing?.IsYou ? 'Sair do time' : 'Remover do time'}
        onConfirm={() => (removing ? remove(removing) : undefined)}
      />

      <ConfirmDialog
        open={demoting !== null}
        onOpenChange={(open) => {
          if (!open) setDemoting(null)
        }}
        title="Deixar de administrar este projeto?"
        description="Você perde na hora o acesso à configuração, e só quem administra pode devolver."
        confirmLabel="Deixar de administrar"
        tone="warn"
        onConfirm={() => (demoting ? changeRole(demoting, 'Member') : undefined)}
      />
    </section>
  )
}

function MemberRow({
  member,
  admin,
  changing,
  onPickRole,
  onRemove,
}: {
  member: TeamMemberViewModel
  admin: boolean
  changing: boolean
  onPickRole: (role: ProjectRole) => void
  onRemove: () => void
}) {
  // A segunda linha diz o que a API ja manda: o e-mail, se o nome ocupa a primeira, e
  // ha quanto tempo a pessoa esta no time. O dono nao tem data de entrada.
  const details = [
    member.Name && member.Email ? member.Email : null,
    member.JoinedAt ? `entrou ${formatRelative(member.JoinedAt)}` : null,
  ].filter((part): part is string => part !== null)

  return (
    <li className="flex animate-fade-in flex-wrap items-center gap-x-3.5 gap-y-2 border-border border-b px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-surface-sunken motion-reduce:transition-none">
      <Avatar member={member} />

      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-body text-fg">
          {member.Name ?? member.Email ?? 'Sem nome'}
          {member.IsYou && (
            <span className="ml-2 font-normal text-caption text-fg-muted">(você)</span>
          )}
        </div>
        {details.length > 0 && (
          <div className="truncate text-detail text-fg-muted">{details.join(' · ')}</div>
        )}
      </div>

      {/* O dono nao muda de papel nem sai: manda em todos os projetos da conta. */}
      {admin && !member.IsAccountOwner ? (
        // No celular os controles descem para a linha de baixo, alinhados ao nome:
        // ao lado dele, o nome ficava com tres letras.
        <div className="flex flex-none items-center gap-1.5 max-sm:basis-full max-sm:pl-12.5">
          <Select
            size="sm"
            ariaLabel={`Papel de ${personName(member, 'quem está no time')}`}
            value={member.Role}
            disabled={changing}
            onChange={(value) => onPickRole(value as ProjectRole)}
            options={ROLE_OPTIONS}
          />
          {/* Na propria linha, a acao e sair, e o botao diz isso: "Remover"
              ao lado do proprio nome assustava. */}
          <Button
            size="sm"
            variant="ghost"
            aria-label={member.IsYou ? undefined : `Remover ${personName(member)} do time`}
            onClick={onRemove}
          >
            {member.IsYou ? 'Sair do time' : 'Remover'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-none items-center gap-1.5">
          <span className="flex-none rounded-md bg-surface-sunken px-2 py-0.5 font-medium text-caption text-fg-muted">
            {member.IsAccountOwner ? 'Dono' : roleName(member.Role)}
          </span>
          {/* Quem e so membro tambem sai, pela propria linha. */}
          {member.IsYou && !member.IsAccountOwner && (
            <Button size="sm" variant="ghost" onClick={onRemove}>
              Sair do time
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
