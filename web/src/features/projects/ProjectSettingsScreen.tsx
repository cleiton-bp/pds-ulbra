import { useEffect, useId, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { MAX_PROJECT_NAME_LENGTH } from '@/contracts'
import { describeError } from '@/data'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { CopyButton } from '@/shared/components/CopyButton'
import { SettingsHeader } from '@/shared/components/SettingsHeader'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { formatDate } from '@/shared/lib/datetime'
import { roleLabel } from '@/shared/lib/projectAccess'

/**
 * O projeto em si: de quem e, o identificador, o nome e o arquivamento. Os dominios
 * moravam aqui e ganharam tela propria (Domínios): o link antigo, `settings#dominios`,
 * que o sino ja mandou, e levado para la.
 *
 * **O estado vem no titulo**, e nao escondido no fim: arquivado, o projeto para de
 * aceitar relatos, e quem abre a tela precisa saber antes de mexer no nome. A faixa
 * logo abaixo traz o Desarquivar junto, para nao obrigar a rolar ate o fim.
 *
 * **Nada fica recolhido.** O identificador e o arquivamento moravam num "Mais opções";
 * a tela tem tao pouco que recolher so escondia. O identificador vai para o cartao
 * "Sobre o projeto", com o Copiar, e arquivar fica numa secao separada no fim. A ancora
 * `mais-opcoes` continua existindo em volta dela, para o link antigo cair no lugar
 * onde aquilo morava.
 *
 * **O nome salva pelo Salvar do titulo**, como todo formulario de configuracao, e a
 * previa mostra o nome como o seletor do topo o desenha — inclusive cortado, que e o
 * que a pessoa nao percebe ate salvar.
 *
 * Dois textos que vale manter: o identificador vem com a explicacao de que renomear
 * **nao** o altera (senao a duvida vira chamado de suporte), e arquivar e apresentado
 * pelo que preserva — "nada e apagado". O botao e cinza porque a acao tem desfazer.
 */
export function ProjectSettingsScreen() {
  const project = useCurrentProject()
  const { hash } = useLocation()
  const updateProject = useProjectsStore((state) => state.update)
  const previewLabelId = useId()

  const [name, setName] = useState(project.Name)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [confirmingArchive, setConfirmingArchive] = useState(false)

  // Trocar de projeto pelo seletor mantem esta tela montada; sem isto o campo
  // ficaria com o nome do projeto anterior. A dependencia e o **identificador**:
  // reagir ao nome faria o efeito disparar contra o proprio projeto recem-salvo.
  //
  // biome-ignore lint/correctness/useExhaustiveDependencies: `project.Name` e lido de proposito sem estar na lista
  useEffect(() => {
    setName(project.Name)
    setError(null)
  }, [project.PublicId])

  const archived = project.Status === 'Archived'
  const dirty = name.trim() !== project.Name

  async function save() {
    if (!dirty || saving) return
    if (name.trim().length === 0) {
      setError('O projeto precisa de um nome.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await updateProject(project.PublicId, { Name: name.trim() })
      setName(name.trim())
      toast.done('Nome do projeto salvo.')
    } catch (failure) {
      setError(describeError(failure))
    } finally {
      setSaving(false)
    }
  }

  async function toggleArchive() {
    // Desarquivar vem direto do botao, sem o `ConfirmDialog` que segura o clique:
    // sem `archiving`, dois cliques virariam duas requisicoes.
    setArchiving(true)

    try {
      await updateProject(project.PublicId, { Status: archived ? 'Active' : 'Archived' })
      toast.done(archived ? 'Projeto reativado.' : 'Projeto arquivado.')
    } catch (failure) {
      toast.error(describeError(failure))
    } finally {
      setArchiving(false)
    }
  }

  // Os dominios sairam daqui. O `#` de cada lista vai junto, para o link antigo cair
  // no mesmo lugar da tela nova.
  if (DOMAIN_ANCHORS.has(hash.replace(/^#/, ''))) {
    return <Navigate to={`../domains${hash}`} replace />
  }

  return (
    <div className="max-w-160">
      <SettingsHeader
        title="Projeto"
        status={<StatusPill archived={archived} />}
        description="De quem é o projeto, o nome dele, e arquivar quando ele deixar de receber relatos."
        dirty={dirty}
        changeCount={dirty ? 1 : 0}
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => {
          setName(project.Name)
          setError(null)
        }}
      />

      {archived && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn-border bg-warn-surface px-4 py-3"
        >
          <p className="text-body text-warn-fg">
            Este projeto está arquivado e não aceita relatos novos.
          </p>
          <Button size="sm" disabled={archiving} onClick={() => void toggleArchive()}>
            Desarquivar
          </Button>
        </div>
      )}

      <section
        aria-labelledby="sobre-o-projeto-titulo"
        className="mb-6 rounded-xl border border-border bg-surface-raised p-5"
      >
        <h2 id="sobre-o-projeto-titulo" className="mb-3 font-semibold text-fg text-lead">
          Sobre o projeto
        </h2>

        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-body">
          <dt className="text-fg-muted">Conta</dt>
          <dd className="min-w-0 truncate text-fg">{project.Account.Name}</dd>
          <dt className="text-fg-muted">Você</dt>
          <dd className="text-fg">{roleLabel(project)}</dd>
          <dt className="text-fg-muted">Criado em</dt>
          <dd className="text-fg">{formatDate(project.CreatedAt)}</dd>
        </dl>

        <div id="identificador" className="mt-4 scroll-mt-6 border-border border-t pt-4">
          <div className="mb-1.5 text-detail text-fg-muted">Identificador do projeto</div>
          <div className="flex min-w-0 items-center gap-2">
            <code className="flex h-8 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-surface px-3 font-mono text-detail text-fg">
              {project.PublicId}
            </code>
            <CopyButton value={project.PublicId} size="sm" />
          </div>
          {/* O script do site leva a chave publica, e nao este identificador: a
              frase antiga ensinava errado o que importa para a instalacao. */}
          <p className="mt-1.5 text-detail text-fg-muted leading-normal">
            Aparece nos endereços do painel e não muda quando você renomeia o projeto.
          </p>
        </div>
      </section>

      <section id="nome-do-projeto" className="scroll-mt-6">
        <TextField
          label="Nome do projeto"
          hint="Aparece na lista de projetos e no seletor do topo."
          value={name}
          onChange={(value) => {
            setName(value)
            if (error) setError(null)
          }}
          error={error}
          maxLength={MAX_PROJECT_NAME_LENGTH}
          disabled={saving}
          onSubmit={save}
        />

        {/* So o desenho do seletor, sem importar o dele: a previa nao abre menu nem
            navega, e acompanhar o rascunho aqui evita salvar para descobrir o corte. */}
        <figure
          aria-labelledby={previewLabelId}
          className="mt-3 flex min-w-0 flex-wrap items-center gap-2"
        >
          <figcaption id={previewLabelId} className="text-detail text-fg-muted">
            Aparece assim no topo:
          </figcaption>
          <span className="flex h-8 min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 font-medium text-body text-fg">
            <span className="min-w-0 text-left max-sm:line-clamp-2 max-sm:text-caption max-sm:leading-tight sm:max-w-40 sm:truncate">
              {name.trim() || '—'}
            </span>
            <span aria-hidden className="flex-none text-caption text-fg-muted">
              ▾
            </span>
          </span>
        </figure>
      </section>

      {/* `mais-opcoes` era o recolhido que guardava isto: o link antigo cai aqui. */}
      <div id="mais-opcoes" className="mt-10 scroll-mt-6 border-border border-t pt-6">
        <section id="arquivar-projeto" className="scroll-mt-6">
          <h2 className="mb-1 font-semibold text-fg text-lead">Arquivar projeto</h2>
          <p className="mb-4 text-detail text-fg-muted leading-relaxed">
            O projeto sai da lista principal e o script instalado para de aceitar relatos. Nada é
            apagado, e dá para desarquivar quando quiser.
          </p>

          {/* Arquivar e uma acao, com confirmacao, e nao um campo do formulario: vale
              na hora, como permitir um dominio. */}
          <Button
            disabled={archiving}
            onClick={() => (archived ? void toggleArchive() : setConfirmingArchive(true))}
          >
            {archived ? 'Desarquivar projeto' : 'Arquivar projeto'}
          </Button>
        </section>
      </div>

      <ConfirmDialog
        open={confirmingArchive}
        onOpenChange={setConfirmingArchive}
        title={`Arquivar ${project.Name}`}
        description="O projeto sai da lista principal e para de aceitar relatos. Nada é apagado e você pode desarquivar depois, sem trocar o script no seu sistema."
        confirmLabel="Arquivar projeto"
        onConfirm={toggleArchive}
      />
    </div>
  )
}

/**
 * Ativo ou arquivado, ao lado do titulo. So informa: a troca mora na faixa e no fim
 * da tela, onde vem com a explicacao do que acontece.
 */
function StatusPill({ archived }: { archived: boolean }) {
  return (
    <span
      className={cn(
        'flex flex-none items-center gap-2 rounded-full border px-3 py-1 font-medium text-detail',
        archived
          ? 'border-warn-border bg-warn-surface text-warn-fg'
          : 'border-chip-green-border bg-chip-green-surface text-chip-green-fg',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-2 flex-none rounded-full',
          archived ? 'bg-warn-fg' : 'bg-chip-green-glyph',
        )}
      />
      {archived ? 'Arquivado' : 'Ativo'}
    </span>
  )
}

/** As ancoras da antiga parte de dominios desta tela, que hoje sao da tela Domínios. */
const DOMAIN_ANCHORS = new Set([
  'dominios',
  'aguardando-liberacao',
  'dominios-observados',
  'bloqueados',
  'autorizados',
])
