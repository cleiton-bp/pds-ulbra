import { useCallback, useEffect, useState } from 'react'
import {
  type CardColor,
  MAX_PRIORITY_NAME_LENGTH,
  type ProjectPriorityViewModel,
} from '@/contracts'
import { describeError, projectPriorityService } from '@/data'
import { Button } from '@/shared/components/Button'
import { CardChip, CardColorPicker } from '@/shared/components/CardChip'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'

/**
 * As prioridades do projeto.
 *
 * **Os nomes sao do time**, como os estados: o projeto nasce com Baixa, Média, Alta
 * e Urgente, e o time renomeia, troca a cor, reordena ou cria outras. **O card nasce
 * sem prioridade** — escolher e decisao de alguem, e nao um padrao.
 *
 * **Aposentar, e nao apagar**: a prioridade continua nos cards que ja a tem e sai da
 * lista de escolha. **Reordenar e otimista**, como nos estados: a seta move na hora,
 * e a lista volta se o servidor recusar.
 */
export function PrioritiesScreen() {
  const project = useCurrentProject()

  const {
    data: loaded,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(() => projectPriorityService.listPriorities(project.PublicId), [project.PublicId]),
  )

  const [priorities, setPriorities] = useState<ProjectPriorityViewModel[] | null>(null)
  useEffect(() => setPriorities(loaded), [loaded])

  const [name, setName] = useState('')
  const [color, setColor] = useState<CardColor>('Gray')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [editing, setEditing] = useState<{
    publicId: string
    name: string
    color: CardColor
  } | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [moving, setMoving] = useState(false)
  const [retiring, setRetiring] = useState<ProjectPriorityViewModel | null>(null)

  const trocar = (salva: ProjectPriorityViewModel) =>
    setPriorities((lista) =>
      (lista ?? []).map((item) => (item.PublicId === salva.PublicId ? salva : item)),
    )

  async function create() {
    const value = name.trim()
    if (value.length === 0 || creating) return

    setCreating(true)
    setCreateError(null)

    try {
      const created = await projectPriorityService.addPriority(project.PublicId, {
        Name: value,
        Color: color,
      })
      // Entra no fim, como a mais urgente: e onde a API a colocou.
      setPriorities((lista) => [...(lista ?? []), created])
      setName('')
    } catch (failure) {
      setCreateError(describeError(failure))
    } finally {
      setCreating(false)
    }
  }

  async function saveEdit() {
    if (!editing || saving) return

    const value = editing.name.trim()
    if (value.length === 0) return

    setSaving(true)
    setEditError(null)

    try {
      trocar(
        await projectPriorityService.updatePriority(project.PublicId, editing.publicId, {
          Name: value,
          Color: editing.color,
        }),
      )
      setEditing(null)
    } catch (failure) {
      setEditError(describeError(failure))
    } finally {
      setSaving(false)
    }
  }

  async function move(index: number, delta: number) {
    if (!priorities || moving) return

    const target = index + delta
    if (target < 0 || target >= priorities.length) return

    const anterior = priorities
    const nova = [...priorities]
    const [item] = nova.splice(index, 1)
    if (!item) return
    nova.splice(target, 0, item)

    setPriorities(nova)
    setMoving(true)

    try {
      setPriorities(
        await projectPriorityService.reorderPriorities(project.PublicId, {
          Order: nova.map((priority) => priority.PublicId),
        }),
      )
    } catch (failure) {
      // Volta para a ordem de antes: deixar no lugar novo mostraria uma ordem que o
      // banco nao tem.
      setPriorities(anterior)
      toast.error(describeError(failure))
    } finally {
      setMoving(false)
    }
  }

  async function setActive(priority: ProjectPriorityViewModel, active: boolean) {
    try {
      trocar(
        active
          ? await projectPriorityService.activatePriority(project.PublicId, priority.PublicId)
          : await projectPriorityService.deactivatePriority(project.PublicId, priority.PublicId),
      )
      toast.done(active ? 'Prioridade de volta à lista.' : 'Prioridade aposentada.')
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  return (
    <div className="max-w-160">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Prioridades</h1>
      <p className="mb-8 text-fg-muted text-body">
        O quanto cada card importa, com as palavras da sua equipe. O card nasce sem prioridade:
        escolher é decisão de alguém do time.
      </p>

      <section>
        <h2 className="mb-1 font-semibold text-lead">Da menos para a mais urgente</h2>
        <p className="mb-4 text-detail text-fg-muted leading-relaxed">
          A ordem é a da lista de escolha no card. Aposentar tira a prioridade da lista sem mexer
          nos cards que já a têm.
        </p>

        {failed && (
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
              Não deu para carregar as prioridades agora. A falha foi ao consultar: nada mudou.
            </p>
            <Button onClick={reload}>Tentar de novo</Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-2">
            {['w-24', 'w-32', 'w-20'].map((width) => (
              <div
                key={width}
                className="flex h-12 items-center rounded-lg border border-border bg-surface-raised px-3.5"
              >
                <Skeleton className={`h-3 ${width}`} />
              </div>
            ))}
          </div>
        )}

        {priorities !== null && priorities.length > 0 && (
          <ul className="mb-6 flex flex-col gap-2">
            {priorities.map((priority, index) =>
              editing?.publicId === priority.PublicId ? (
                <li
                  key={priority.PublicId}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-3"
                >
                  <TextField
                    label="Nome"
                    value={editing.name}
                    onChange={(value) => {
                      setEditing({ ...editing, name: value })
                      if (editError) setEditError(null)
                    }}
                    error={editError}
                    maxLength={MAX_PRIORITY_NAME_LENGTH}
                    disabled={saving}
                    autoFocus
                    onSubmit={saveEdit}
                  />
                  <CardColorPicker
                    label="Cor"
                    value={editing.color}
                    onChange={(cor) => setEditing({ ...editing, color: cor })}
                    disabled={saving}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={editing.name.trim().length === 0 || saving}
                      onClick={saveEdit}
                    >
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                  </div>
                </li>
              ) : (
                <li
                  key={priority.PublicId}
                  className="group flex items-center gap-2 rounded-lg border border-border bg-surface-raised py-2 pr-2 pl-1.5"
                >
                  <div className="flex flex-none flex-col">
                    <MoveButton
                      direction="up"
                      label={`Mover ${priority.Name} para cima`}
                      disabled={index === 0 || moving || editing !== null}
                      onClick={() => void move(index, -1)}
                    />
                    <MoveButton
                      direction="down"
                      label={`Mover ${priority.Name} para baixo`}
                      disabled={index === priorities.length - 1 || moving || editing !== null}
                      onClick={() => void move(index, 1)}
                    />
                  </div>

                  <span className="min-w-0 flex-1">
                    <CardChip
                      color={priority.Color}
                      className={priority.IsActive ? undefined : 'opacity-60'}
                    >
                      {priority.Name}
                    </CardChip>
                  </span>

                  {!priority.IsActive && (
                    <span className="flex-none text-caption text-fg-muted">Aposentada</span>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Editar ${priority.Name}`}
                    onClick={() => {
                      setEditError(null)
                      setEditing({
                        publicId: priority.PublicId,
                        name: priority.Name,
                        color: priority.Color,
                      })
                    }}
                  >
                    Editar
                  </Button>

                  {priority.IsActive ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Aposentar ${priority.Name}`}
                      onClick={() => setRetiring(priority)}
                    >
                      Aposentar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Reativar ${priority.Name}`}
                      onClick={() => void setActive(priority, true)}
                    >
                      Reativar
                    </Button>
                  )}
                </li>
              ),
            )}
          </ul>
        )}

        {priorities !== null && (
          <div className="flex flex-col gap-3 rounded-lg border border-border border-dashed p-3">
            <TextField
              label="Nova prioridade"
              value={name}
              onChange={(value) => {
                setName(value)
                if (createError) setCreateError(null)
              }}
              placeholder="Bloqueante"
              error={createError}
              maxLength={MAX_PRIORITY_NAME_LENGTH}
              disabled={creating}
              onSubmit={create}
            />
            <CardColorPicker label="Cor" value={color} onChange={setColor} disabled={creating} />
            <div>
              <Button
                variant="primary"
                disabled={name.trim().length === 0 || creating}
                onClick={create}
              >
                Criar prioridade
              </Button>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={retiring !== null}
        onOpenChange={(open) => {
          if (!open) setRetiring(null)
        }}
        title="Aposentar prioridade"
        description="Ela sai da lista de escolha, mas continua nos cards que já a têm — e no histórico deles. Dá para trazer de volta quando quiser."
        confirmLabel="Aposentar"
        onConfirm={() => (retiring ? setActive(retiring, false) : undefined)}
      />
    </div>
  )
}

/**
 * A seta de mover, com nome proprio para leitor de tela — "Mover Alta para cima" —,
 * como na tela de Estados.
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
