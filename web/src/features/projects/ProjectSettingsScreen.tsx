import { useEffect, useState } from 'react'
import { MAX_PROJECT_NAME_LENGTH } from '@/contracts'
import { describeError } from '@/data'
import { AllowedOriginsSection } from '@/features/projects/AllowedOriginsSection'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'

/**
 * Nome, de onde a ferramenta pode rodar, e arquivamento. Limites e plano ainda
 * dependem de decisao.
 *
 * Dois textos que vale manter: o identificador vem com a explicacao de que
 * renomear **nao** o altera (senao a duvida vira chamado de suporte), e arquivar
 * e apresentado pelo que preserva — "nada e apagado". O botao e cinza porque a
 * acao tem desfazer.
 */
export function ProjectSettingsScreen() {
  const project = useCurrentProject()
  const updateProject = useProjectsStore((state) => state.update)

  const [name, setName] = useState(project.Name)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
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
    setSaved(false)
  }, [project.PublicId])

  // Some sozinho, e tambem se a pessoa sair antes do prazo. Igual ao `CopyButton`.
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [saved])

  const archived = project.Status === 'Archived'
  const dirty = name.trim() !== project.Name && name.trim().length > 0

  async function save() {
    if (!dirty) return

    setSaving(true)
    setError(null)

    try {
      await updateProject(project.PublicId, { Name: name.trim() })
      setSaved(true)
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

  return (
    <div className="max-w-160">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Configurações</h1>
      <p className="mb-8 text-fg-muted text-body">Ajustes deste projeto.</p>

      <section className="mb-8">
        <h2 className="mb-1 font-semibold text-lead">Nome do projeto</h2>
        <p className="mb-3.5 text-detail text-fg-muted">
          É o nome que você vê na lista de projetos e no seletor do console.
        </p>

        <div className="mb-5 flex items-start gap-2">
          <TextField
            className="min-w-0 flex-1"
            ariaLabel="Nome do projeto"
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
          <Button variant="primary" disabled={!dirty || saving} onClick={save}>
            {saved ? 'Salvo' : 'Salvar'}
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised px-3.5 py-3">
          <div className="mb-1.5 text-detail text-fg-muted">Identificador do projeto</div>
          <code className="font-mono text-detail text-fg">{project.PublicId}</code>
          <p className="mt-2 text-detail text-fg-muted leading-normal">
            Renomear o projeto não muda este identificador: ele já está no script instalado no seu
            site, e trocá-lo pararia de receber relatos.
          </p>
        </div>
      </section>

      <div className="mb-8 h-px bg-border" />

      <div className="mb-8">
        <AllowedOriginsSection projectPublicId={project.PublicId} />
      </div>

      <div className="mb-8 h-px bg-border" />

      <section>
        <h2 className="mb-1 font-semibold text-lead">Arquivar projeto</h2>
        <p className="mb-4 text-detail text-fg-muted leading-relaxed">
          Arquivar tira o projeto da lista principal e faz o script instalado parar de aceitar novos
          relatos. Nada é apagado: chaves, configurações e histórico continuam aqui, e você pode
          desarquivar quando quiser.
        </p>

        <Button
          disabled={archiving}
          onClick={() => (archived ? void toggleArchive() : setConfirmingArchive(true))}
        >
          {archived ? 'Desarquivar projeto' : 'Arquivar projeto'}
        </Button>
      </section>

      <ConfirmDialog
        open={confirmingArchive}
        onOpenChange={setConfirmingArchive}
        title={`Arquivar ${project.Name}`}
        description="O projeto sai da lista principal e para de aceitar relatos. Nada é apagado e você pode desarquivar depois, sem trocar o script do site."
        confirmLabel="Arquivar projeto"
        onConfirm={toggleArchive}
      />
    </div>
  )
}
