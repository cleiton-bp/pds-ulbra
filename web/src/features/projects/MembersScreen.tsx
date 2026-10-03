import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  InvitationUnavailableReason,
  ProjectInvitationsViewModel,
  ProjectInvitationViewModel,
  ProjectRole,
  TeamMemberViewModel,
} from '@/contracts'
import { MAX_INVITATION_VALIDITY_DAYS, MIN_INVITATION_VALIDITY_DAYS } from '@/contracts'
import { describeError, projectTeamService } from '@/data'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { formatDate, formatRelative } from '@/shared/lib/datetime'
import { canConfigure } from '@/shared/lib/projectAccess'

const ROLE_OPTIONS: { value: ProjectRole; label: string }[] = [
  { value: 'Member', label: 'Membro' },
  { value: 'Administrator', label: 'Administrador' },
]

/** Prazos que cobrem o comum; o atual entra na lista se for outro. */
const VALIDITY_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 30]

/** Quanto tempo a tela acompanha um e-mail na fila antes de parar de perguntar. */
const POLL_INTERVAL_MS = 2000
const POLL_MAX_TRIES = 15

/**
 * O time do projeto.
 *
 * **Todo o time abre esta tela**, e quem e so membro le: e daqui que se sabe com
 * quem se trabalha. Convidar, acompanhar os convites, mudar papel e remover
 * aparecem para quem administra — a API recusa o resto de qualquer forma.
 *
 * **O link do convite nunca aparece.** Ele so existe dentro do e-mail, e e isso
 * que faz o convite ser da pessoa convidada: aceitar exige entrar com o Google do
 * mesmo endereco. A tela mostra so onde o e-mail esta — na fila, enviado, ou
 * "nao saiu", com reenviar.
 */
export function MembersScreen() {
  const project = useCurrentProject()
  const admin = canConfigure(project)

  return (
    <div className="max-w-170">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Membros</h1>
      <p className="mb-8 text-body text-fg-muted leading-relaxed">
        {admin
          ? 'Quem trabalha neste projeto, e os convites para quem ainda vai entrar.'
          : 'Quem trabalha neste projeto. Quem administra convida, muda papéis e remove.'}
      </p>

      {admin && <InvitationsSection projectPublicId={project.PublicId} />}
      <TeamSection projectPublicId={project.PublicId} admin={admin} />
    </div>
  )
}

// ─── O time ──────────────────────────────────────────────────────────────────

function TeamSection({ projectPublicId, admin }: { projectPublicId: string; admin: boolean }) {
  const navigate = useNavigate()
  const loadProjects = useProjectsStore((state) => state.load)

  const { data, loading, failed, reload } = useAsyncResource(
    useCallback(() => projectTeamService.listMembers(projectPublicId), [projectPublicId]),
  )

  // Copia local: mudar o papel ou remover nao traz o esqueleto de volta.
  const [members, setMembers] = useState<TeamMemberViewModel[] | null>(null)
  useEffect(() => setMembers(data), [data])

  const [removing, setRemoving] = useState<TeamMemberViewModel | null>(null)
  const [changing, setChanging] = useState<string | null>(null)

  async function changeRole(member: TeamMemberViewModel, role: ProjectRole) {
    if (role === member.Role) return
    setChanging(member.UserPublicId)

    try {
      const updated = await projectTeamService.changeMemberRole(
        projectPublicId,
        member.UserPublicId,
        {
          Role: role,
        },
      )
      setMembers((list) =>
        (list ?? []).map((item) => (item.UserPublicId === updated.UserPublicId ? updated : item)),
      )
      toast.done('Papel alterado.')

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
      toast.done('Pessoa removida do time.')
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  return (
    <section aria-labelledby="time-do-projeto">
      <h2 id="time-do-projeto" className="mb-3 font-semibold text-lead">
        Time
      </h2>

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar o time agora. Ninguém saiu do projeto por causa disso.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && <LoadingRows />}

      {members !== null && (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.UserPublicId}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface-raised py-2.5 pr-2.5 pl-3.5"
            >
              <Avatar member={member} />

              <div className="min-w-0 flex-1">
                <div className="truncate text-body text-fg">
                  {member.Name ?? member.Email ?? 'Sem nome'}
                  {member.IsYou && (
                    <span className="ml-1.5 text-caption text-fg-muted">(você)</span>
                  )}
                </div>
                {member.Email && member.Name && (
                  <div className="truncate text-detail text-fg-muted">{member.Email}</div>
                )}
              </div>

              {/* O dono nao muda de papel nem sai: manda em todos os projetos da conta. */}
              {admin && !member.IsAccountOwner ? (
                // No celular os controles descem para a linha de baixo, alinhados ao nome:
                // ao lado dele, o nome ficava com tres letras.
                <div className="flex flex-none items-center gap-1.5 max-sm:basis-full max-sm:pl-11">
                  <Select
                    size="sm"
                    ariaLabel={`Papel de ${member.Name ?? member.Email ?? 'quem está no time'}`}
                    value={member.Role}
                    disabled={changing === member.UserPublicId}
                    onChange={(value) => void changeRole(member, value as ProjectRole)}
                    options={ROLE_OPTIONS}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={
                      member.IsYou
                        ? 'Sair do time'
                        : `Remover ${member.Name ?? member.Email ?? 'esta pessoa'} do time`
                    }
                    onClick={() => setRemoving(member)}
                  >
                    Remover
                  </Button>
                </div>
              ) : (
                <span className="flex-none rounded-md border border-border px-1.5 py-0.5 text-caption text-fg-muted">
                  {member.IsAccountOwner ? 'Dono' : roleName(member.Role)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={removing?.IsYou ? 'Sair do time' : 'Remover do time'}
        description={
          removing?.IsYou
            ? 'Você perde o acesso a este projeto agora. Para voltar, alguém que administra precisa convidar você de novo.'
            : 'A pessoa perde o acesso a este projeto na próxima vez que abrir o painel. O que ela escreveu nos relatos continua com o nome dela.'
        }
        confirmLabel={removing?.IsYou ? 'Sair do time' : 'Remover do time'}
        onConfirm={() => (removing ? remove(removing) : undefined)}
      />
    </section>
  )
}

// ─── Convites (só administrador) ─────────────────────────────────────────────

function InvitationsSection({ projectPublicId }: { projectPublicId: string }) {
  /**
   * Quantas vezes a lista mudou por um clique daqui — convidar, reenviar, cancelar.
   * Cada leitura leva o numero de quando saiu: a que saiu antes de um clique chega
   * sem ele, e por cima traria de volta o convite que acabou de ser cancelado.
   */
  const edits = useRef(0)

  const { data, loading, failed, reload, refresh } = useAsyncResource(
    useCallback(async () => {
      const edit = edits.current
      return { list: await projectTeamService.listInvitations(projectPublicId), edit }
    }, [projectPublicId]),
  )

  const [view, setView] = useState<ProjectInvitationsViewModel | null>(null)
  useEffect(() => {
    // Lida antes do ultimo clique: nao vale, e a proxima ja sai com ele.
    if (data !== null && data.edit !== edits.current) {
      refresh()
      return
    }
    setView(data?.list ?? null)
  }, [data, refresh])

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ProjectRole>('Member')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [resending, setResending] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<ProjectInvitationViewModel | null>(null)

  /** Convidar e reenviar comecam outra rodada de perguntas, com o tempo inteiro. */
  const [round, setRound] = useState(0)

  // Enquanto algum e-mail esta na fila, a tela pergunta de novo — quem convidou
  // quer ver "enviado" sem recarregar. Para sozinha depois de meio minuto: o
  // e-mail preso nao prende a tela, e "Reenviar" fica ao lado.
  const waiting = view?.Items.some(
    (item) => item.EmailStatus === 'Pending' || item.EmailStatus === 'Sending',
  )
  useEffect(() => {
    // `round` so existe para um convite novo recomecar a contagem: com outro ja
    // esperando, `waiting` nao muda, e o novo ficaria sem pergunta nenhuma.
    void round
    if (!waiting) return
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      refresh()
      if (tries >= POLL_MAX_TRIES) clearInterval(timer)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [waiting, refresh, round])

  function upsert(invitation: ProjectInvitationViewModel) {
    edits.current += 1
    setRound((value) => value + 1)
    setView((current) =>
      current
        ? {
            ...current,
            Items: [
              invitation,
              ...current.Items.filter((item) => item.PublicId !== invitation.PublicId),
            ],
          }
        : current,
    )
  }

  async function invite() {
    const value = email.trim()
    if (value.length === 0 || sending) return

    setSending(true)
    setError(null)

    try {
      upsert(
        await projectTeamService.createInvitation(projectPublicId, { Email: value, Role: role }),
      )
      setEmail('')
      toast.done('Convite na fila. O e-mail sai em instantes.')
    } catch (failure) {
      // E-mail invalido, pessoa que ja esta no time, limite por hora: tudo e do
      // campo — ha o que corrigir, e a correcao e ali.
      setError(describeError(failure))
    } finally {
      setSending(false)
    }
  }

  async function resend(invitation: ProjectInvitationViewModel) {
    if (resending) return
    setResending(invitation.PublicId)

    try {
      upsert(await projectTeamService.resendInvitation(projectPublicId, invitation.PublicId))
      toast.done('Convite reenviado. O link anterior deixou de valer.')
    } catch (failure) {
      toast.error(describeError(failure))
    } finally {
      setResending(null)
    }
  }

  async function revoke(invitation: ProjectInvitationViewModel) {
    try {
      await projectTeamService.revokeInvitation(projectPublicId, invitation.PublicId)
      edits.current += 1
      setView((current) =>
        current
          ? {
              ...current,
              Items: current.Items.filter((item) => item.PublicId !== invitation.PublicId),
            }
          : current,
      )
      toast.done('Convite cancelado. O link deixou de valer.')
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  async function saveValidity(days: number) {
    try {
      const saved = await projectTeamService.saveTeamSettings(projectPublicId, {
        InvitationValidityDays: days,
      })
      setView((current) =>
        current ? { ...current, ValidityDays: saved.InvitationValidityDays } : current,
      )
      toast.done('Prazo salvo. Vale para o próximo convite.')
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  const validityOptions = [...new Set([...VALIDITY_OPTIONS, view?.ValidityDays ?? 7])]
    .filter((days) => days >= MIN_INVITATION_VALIDITY_DAYS && days <= MAX_INVITATION_VALIDITY_DAYS)
    .sort((a, b) => a - b)
    .map((days) => ({ value: String(days), label: days === 1 ? '1 dia' : `${days} dias` }))

  return (
    <section aria-labelledby="convidar" className="mb-10">
      <h2 id="convidar" className="mb-1 font-semibold text-lead">
        Convidar alguém
      </h2>

      {failed && (
        <div className="mt-3 rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar os convites agora. Os que já saíram continuam valendo.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && <LoadingRows />}

      {view !== null && (
        <>
          <p className="mb-4 text-detail text-fg-muted leading-relaxed">
            O convite vai por e-mail, e quem recebe entra com a conta Google do mesmo endereço — o
            link encaminhado para outra pessoa não serve para ela.
          </p>

          {view.CanInvite ? (
            <div className="mb-4 flex flex-wrap items-start gap-2">
              <TextField
                className="min-w-56 flex-1"
                ariaLabel="E-mail de quem vai entrar"
                value={email}
                onChange={(value) => {
                  setEmail(value)
                  if (error) setError(null)
                }}
                placeholder="nome@exemplo.com"
                error={error}
                maxLength={320}
                disabled={sending}
                onSubmit={invite}
              />
              <Select
                ariaLabel="Papel de quem vai entrar"
                value={role}
                disabled={sending}
                onChange={(value) => setRole(value as ProjectRole)}
                options={ROLE_OPTIONS}
              />
              <Button
                variant="primary"
                disabled={email.trim().length === 0 || sending}
                onClick={invite}
              >
                {sending ? 'Convidando…' : 'Convidar'}
              </Button>
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-border border-dashed px-3.5 py-3 text-detail text-fg-muted leading-relaxed">
              {unavailableText(view.UnavailableReason)}
            </div>
          )}

          <div className="mb-6 flex flex-wrap items-center gap-2 text-detail text-fg-muted">
            <span>O convite vale por</span>
            <Select
              size="sm"
              ariaLabel="Prazo do convite"
              value={String(view.ValidityDays)}
              onChange={(value) => void saveValidity(Number(value))}
              options={validityOptions}
            />
            <span>a partir do envio. Mudar vale para o próximo convite.</span>
          </div>

          {view.Items.length > 0 && (
            <>
              <h3 className="mb-2 font-medium text-detail text-fg">Convites abertos</h3>
              <ul className="flex flex-col gap-2">
                {view.Items.map((invitation) => (
                  <li
                    key={invitation.PublicId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface-raised py-2.5 pr-2.5 pl-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body text-fg">{invitation.Email}</div>
                      <InvitationStatus invitation={invitation} />
                    </div>
                    {/* No celular, papel e botoes descem para a linha de baixo: ao lado
                        deles, o endereco ficava com tres letras. */}
                    <div className="flex flex-none items-center gap-1 max-sm:basis-full">
                      <span className="mr-2 flex-none rounded-md border border-border px-1.5 py-0.5 text-caption text-fg-muted">
                        {roleName(invitation.Role)}
                      </span>
                      {/* Reenviar vale em qualquer situacao: e o que solta um e-mail
                          preso, e o reenvio no meio de um envio so troca o link. */}
                      <Button
                        size="sm"
                        aria-label={`Reenviar o convite para ${invitation.Email}`}
                        disabled={resending === invitation.PublicId}
                        onClick={() => void resend(invitation)}
                      >
                        Reenviar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Cancelar o convite para ${invitation.Email}`}
                        onClick={() => setRevoking(invitation)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title="Cancelar convite"
        description="O link do e-mail deixa de valer. Se mudar de ideia, é só convidar de novo."
        confirmLabel="Cancelar convite"
        onConfirm={() => (revoking ? revoke(revoking) : undefined)}
      />
    </section>
  )
}

/**
 * Onde esta o e-mail, numa linha. "Nao saiu" e a unica que pede acao — e o botao
 * de reenviar esta ao lado.
 */
function InvitationStatus({ invitation }: { invitation: ProjectInvitationViewModel }) {
  if (invitation.EmailStatus === 'Failed') {
    return (
      <div className="text-caption text-error-fg">
        O e-mail não saiu. Reenvie para tentar de novo.
      </div>
    )
  }

  if (invitation.EmailStatus === 'Pending' || invitation.EmailStatus === 'Sending') {
    return <div className="text-caption text-fg-muted">Enviando o e-mail…</div>
  }

  if (invitation.IsExpired) {
    return <div className="text-caption text-warn-fg">Venceu. Reenvie para valer de novo.</div>
  }

  return (
    <div className="text-caption text-fg-muted">
      E-mail enviado {formatRelative(invitation.EmailSentAt)} · vale até{' '}
      {formatDate(invitation.ExpiresAt)}
    </div>
  )
}

function unavailableText(reason: InvitationUnavailableReason | null): string {
  const motivo =
    reason === 'QueueNotConfigured'
      ? 'a fila de envio não está configurada'
      : reason === 'PanelUrlNotConfigured'
        ? 'o endereço do painel, que vai no link do e-mail, não está configurado'
        : 'o envio de e-mail não está configurado'

  return `Não dá para convidar agora: neste servidor, ${motivo}. Quem cuida da instalação resolve isso na configuração do servidor.`
}

function roleName(role: ProjectRole): string {
  return role === 'Administrator' ? 'Administrador' : 'Membro'
}

function Avatar({ member }: { member: TeamMemberViewModel }) {
  const initials = (member.Name ?? member.Email ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return member.AvatarUrl ? (
    <img
      src={member.AvatarUrl}
      alt=""
      referrerPolicy="no-referrer"
      className="size-8 flex-none rounded-full"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-8 flex-none items-center justify-center rounded-full bg-surface-sunken font-medium text-caption text-fg-muted"
    >
      {initials}
    </span>
  )
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-2">
      {['w-48', 'w-40', 'w-56'].map((width) => (
        <div
          key={width}
          className="flex h-13 items-center gap-3 rounded-lg border border-border bg-surface-raised px-3.5"
        >
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  )
}
