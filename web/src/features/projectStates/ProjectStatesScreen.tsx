import { useCallback, useEffect, useState } from 'react'
import { MAX_STATE_NAME_LENGTH, type ProjectStateViewModel } from '@/contracts'
import { describeError, projectStateService } from '@/data'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'

/**
 * A fila de trabalho do projeto.
 *
 * **Os nomes sao do cliente, e essa e a decisao que sustenta o resto.** Uma lista
 * fixa, escrita por nos, obrigaria todo time a descrever o processo dele com as
 * nossas palavras — e a traducao entre o que acontece por dentro e o que a pessoa
 * de fora acompanha viraria mapear os nossos nomes nos nossos nomes.
 *
 * **Aposentar, e nao apagar.** Nao ha botao de remover em lugar nenhum desta
 * tela: relato antigo aponta para o estado, e um estado que some leva junto o
 * sentido de tudo que passou por ele. O texto do dialogo diz isso com todas as
 * letras, porque "aposentar" sozinho soa como um jeito educado de apagar.
 *
 * **Reordenar e otimista.** A seta move a linha na hora e so depois grava: uma
 * seta que espera a resposta para mexer parece quebrada, e aqui o erro tem
 * desfazer — a lista volta para a ordem anterior e o aviso explica.
 */
export function ProjectStatesScreen() {
  const project = useCurrentProject()

  const {
    data: loaded,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(() => projectStateService.listProjectStates(project.PublicId), [project.PublicId]),
  )

  // Copia local para criar, renomear e mover sem o esqueleto voltar:
  // `useAsyncResource` zera os dados a cada nova busca, e a lista inteira piscando
  // a cada seta faria a tela parecer que recarregou sozinha.
  const [states, setStates] = useState<ProjectStateViewModel[] | null>(null)
  useEffect(() => setStates(loaded), [loaded])

  const [name, setName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [editing, setEditing] = useState<{ publicId: string; value: string } | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)

  const [moving, setMoving] = useState(false)
  const [retiring, setRetiring] = useState<ProjectStateViewModel | null>(null)

  async function create() {
    const value = name.trim()
    if (value.length === 0 || creating) return

    setCreating(true)
    setCreateError(null)

    try {
      const created = await projectStateService.addProjectState(project.PublicId, { Name: value })
      // Entra no fim porque foi onde a API o colocou. Inserir em outro lugar aqui
      // faria a tela discordar da posicao que acabou de ser gravada.
      setStates((list) => [...(list ?? []), created])
      setName('')
    } catch (failure) {
      // Nome em branco, comprido demais ou repetido pertence ao campo: ha o que
      // corrigir, e a correcao e ali.
      setCreateError(describeError(failure))
    } finally {
      setCreating(false)
    }
  }

  async function saveRename() {
    if (!editing || renaming) return

    const value = editing.value.trim()
    if (value.length === 0) return

    setRenaming(true)
    setRenameError(null)

    try {
      const saved = await projectStateService.renameProjectState(
        project.PublicId,
        editing.publicId,
        {
          Name: value,
        },
      )
      setStates((list) =>
        (list ?? []).map((item) => (item.PublicId === saved.PublicId ? saved : item)),
      )
      setEditing(null)
    } catch (failure) {
      setRenameError(describeError(failure))
    } finally {
      setRenaming(false)
    }
  }

  async function move(index: number, delta: number) {
    if (!states || moving) return

    const target = index + delta
    if (target < 0 || target >= states.length) return

    const next = [...states]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(target, 0, item)

    const previous = states
    setStates(next)
    setMoving(true)

    try {
      const saved = await projectStateService.reorderProjectStates(project.PublicId, {
        Order: next.map((state) => state.PublicId),
      })
      setStates(saved)
    } catch (failure) {
      // A ordem volta a ser a de antes da seta. Deixar a lista no lugar novo
      // mostraria uma ordem que o banco nao tem.
      setStates(previous)
      toast.error(describeError(failure))
    } finally {
      setMoving(false)
    }
  }

  async function setActive(state: ProjectStateViewModel, active: boolean) {
    try {
      const saved = active
        ? await projectStateService.activateProjectState(project.PublicId, state.PublicId)
        : await projectStateService.deactivateProjectState(project.PublicId, state.PublicId)

      setStates((list) =>
        (list ?? []).map((item) => (item.PublicId === saved.PublicId ? saved : item)),
      )
      toast.done(active ? 'Estado de volta à fila.' : 'Estado aposentado.')
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  return (
    <div className="max-w-160">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Estados</h1>
      <p className="mb-8 text-fg-muted text-body">
        As etapas por onde o relato passa aqui dentro, com os nomes que a sua equipe usa.
      </p>

      <section>
        <h2 className="mb-1 font-semibold text-lead">A sua fila de trabalho</h2>
        <p className="mb-4 text-detail text-fg-muted leading-relaxed">
          Nós não escolhemos estas etapas por você: quem conhece o processo é quem trabalha nele.
          Escreva os nomes que a equipe já usa no dia a dia —{' '}
          <strong className="font-medium text-fg">
            "Análise", "Corrigindo", "Testando", "Pronto"
          </strong>{' '}
          — e coloque na ordem em que o trabalho anda.
        </p>

        {failed && (
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
              Não deu para carregar os estados deste projeto agora. A falha foi ao consultar: a sua
              fila continua exatamente como estava.
            </p>
            <Button onClick={reload}>Tentar de novo</Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-2">
            {['w-32', 'w-40', 'w-28'].map((width) => (
              <div
                key={width}
                className="flex h-12 items-center rounded-lg border border-border bg-surface-raised px-3.5"
              >
                <Skeleton className={`h-3 ${width}`} />
              </div>
            ))}
          </div>
        )}

        {states !== null && states.length === 0 && (
          <p className="mb-4 rounded-lg border border-border border-dashed px-3.5 py-5 text-center text-detail text-fg-muted leading-relaxed">
            A sua fila ainda está vazia. O primeiro estado costuma ser o lugar onde o relato chega
            para alguém olhar.
          </p>
        )}

        {states !== null && states.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {states.map((state, index) => (
              <li
                key={state.PublicId}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised py-2 pr-2 pl-2.5"
              >
                <div className="flex flex-none flex-col">
                  <MoveButton
                    direction="up"
                    label={`Mover ${state.Name} para cima`}
                    disabled={index === 0 || moving || editing !== null}
                    onClick={() => move(index, -1)}
                  />
                  <MoveButton
                    direction="down"
                    label={`Mover ${state.Name} para baixo`}
                    disabled={index === states.length - 1 || moving || editing !== null}
                    onClick={() => move(index, 1)}
                  />
                </div>

                {editing?.publicId === state.PublicId ? (
                  <>
                    <TextField
                      className="min-w-0 flex-1"
                      ariaLabel={`Novo nome para ${state.Name}`}
                      value={editing.value}
                      onChange={(value) => {
                        setEditing({ publicId: state.PublicId, value })
                        if (renameError) setRenameError(null)
                      }}
                      error={renameError}
                      maxLength={MAX_STATE_NAME_LENGTH}
                      disabled={renaming}
                      autoFocus
                      onSubmit={saveRename}
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={editing.value.trim().length === 0 || renaming}
                      onClick={saveRename}
                    >
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <span
                      className={`min-w-0 flex-1 truncate text-body ${
                        state.IsActive ? 'text-fg' : 'text-fg-muted line-through'
                      }`}
                    >
                      {state.Name}
                    </span>

                    {!state.IsActive && (
                      <span className="flex-none text-caption text-fg-muted">Aposentado</span>
                    )}

                    {/* O rotulo visivel e curto porque a linha e estreita, e o nome
                        acessivel traz o estado junto: numa lista de oito linhas,
                        oito botoes chamados "Renomear" nao localizam ninguem. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Renomear ${state.Name}`}
                      onClick={() => {
                        setRenameError(null)
                        setEditing({ publicId: state.PublicId, value: state.Name })
                      }}
                    >
                      Renomear
                    </Button>

                    {state.IsActive ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Aposentar ${state.Name}`}
                        onClick={() => setRetiring(state)}
                      >
                        Aposentar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Reativar ${state.Name}`}
                        onClick={() => setActive(state, true)}
                      >
                        Reativar
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {states !== null && (
          <div className="flex items-start gap-2">
            <TextField
              className="min-w-0 flex-1"
              ariaLabel="Nome do estado"
              value={name}
              onChange={(value) => {
                setName(value)
                if (createError) setCreateError(null)
              }}
              placeholder="Corrigindo"
              error={createError}
              maxLength={MAX_STATE_NAME_LENGTH}
              disabled={creating}
              onSubmit={create}
            />
            <Button
              variant="primary"
              disabled={name.trim().length === 0 || creating}
              onClick={create}
            >
              Criar estado
            </Button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={retiring !== null}
        onOpenChange={(open) => {
          if (!open) setRetiring(null)
        }}
        title="Aposentar estado"
        description="Ele sai da fila e deixa de receber relato novo, mas não é apagado: o nome continua no histórico dos relatos que já passaram por ele. Dá para trazer de volta quando quiser."
        confirmLabel="Aposentar"
        onConfirm={() => (retiring ? setActive(retiring, false) : undefined)}
      />
    </div>
  )
}

/**
 * A seta de mover. E um botao com nome proprio para leitor de tela — "Mover
 * Análise para cima" — porque o glifo sozinho se anuncia como "botao", e numa
 * lista de oito linhas iguais isso nao localiza ninguem.
 */
function MoveButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: 'up' | 'down'
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-5 items-center justify-center rounded text-fg-muted enabled:hover:bg-surface-sunken enabled:hover:text-fg disabled:opacity-30"
    >
      <svg
        viewBox="0 0 12 12"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={direction === 'up' ? 'M3 7.2 6 4.2l3 3' : 'M3 4.8 6 7.8l3-3'} />
      </svg>
    </button>
  )
}
