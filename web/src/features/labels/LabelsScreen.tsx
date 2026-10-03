import { useCallback, useEffect, useState } from 'react'
import { type CardColor, MAX_LABEL_NAME_LENGTH, type ProjectLabelViewModel } from '@/contracts'
import { describeError, projectLabelService } from '@/data'
import { Button } from '@/shared/components/Button'
import { CardChip, CardColorPicker } from '@/shared/components/CardChip'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'

/**
 * As etiquetas do projeto, para quem administra organizar.
 *
 * **Quem cria e o time, ao etiquetar um card** — esta tela nao e a porta de entrada
 * delas. Aqui se renomeia, se troca a cor e se apaga: a etiqueta que nasceu com um
 * nome torto, as duas que querem dizer a mesma coisa.
 *
 * **Apagar tira a etiqueta de todos os cards**, e a tela diz de quantos antes de
 * apagar. O historico de cada card continua contando com o nome que ela tinha.
 */
export function LabelsScreen() {
  const project = useCurrentProject()

  const {
    data: loaded,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(() => projectLabelService.listLabels(project.PublicId), [project.PublicId]),
  )

  const [labels, setLabels] = useState<ProjectLabelViewModel[] | null>(null)
  useEffect(() => setLabels(loaded), [loaded])

  const [editing, setEditing] = useState<{
    publicId: string
    name: string
    color: CardColor
  } | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<ProjectLabelViewModel | null>(null)

  async function saveEdit() {
    if (!editing || saving) return

    const value = editing.name.trim()
    if (value.length === 0) return

    setSaving(true)
    setEditError(null)

    try {
      const saved = await projectLabelService.updateLabel(project.PublicId, editing.publicId, {
        Name: value,
        Color: editing.color,
      })
      // Em ordem de nome, como a API devolve: renomear pode mudar o lugar dela.
      setLabels((lista) =>
        ordenar((lista ?? []).map((item) => (item.PublicId === saved.PublicId ? saved : item))),
      )
      setEditing(null)
    } catch (failure) {
      setEditError(describeError(failure))
    } finally {
      setSaving(false)
    }
  }

  async function remove(label: ProjectLabelViewModel) {
    try {
      await projectLabelService.deleteLabel(project.PublicId, label.PublicId)
      setLabels((lista) => (lista ?? []).filter((item) => item.PublicId !== label.PublicId))
      toast.done('Etiqueta apagada.')
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  return (
    <div className="max-w-160">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Etiquetas</h1>
      <p className="mb-8 text-fg-muted text-body">
        Quem cria as etiquetas é o time, ao etiquetar um card. Aqui você organiza: renomeia, troca a
        cor ou apaga a que sobrou.
      </p>

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
            Não deu para carregar as etiquetas agora. A falha foi ao consultar: nada mudou.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {['w-20', 'w-28', 'w-16'].map((width) => (
            <div
              key={width}
              className="flex h-12 items-center rounded-lg border border-border bg-surface-raised px-3.5"
            >
              <Skeleton className={`h-3 ${width}`} />
            </div>
          ))}
        </div>
      )}

      {labels !== null && labels.length === 0 && (
        <p className="rounded-lg border border-border border-dashed px-3.5 py-5 text-center text-detail text-fg-muted leading-relaxed">
          Ainda não há etiquetas. Elas aparecem aqui assim que alguém do time etiquetar um card.
        </p>
      )}

      {labels !== null && labels.length > 0 && (
        <ul className="flex flex-col gap-2">
          {labels.map((label) =>
            editing?.publicId === label.PublicId ? (
              <li
                key={label.PublicId}
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
                  maxLength={MAX_LABEL_NAME_LENGTH}
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
                key={label.PublicId}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised py-2 pr-2 pl-3"
              >
                <span className="min-w-0 flex-1">
                  <CardChip color={label.Color}>{label.Name}</CardChip>
                </span>
                <span className="flex-none text-caption text-fg-muted tabular-nums">
                  {cardsLabel(label.CardCount)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Editar ${label.Name}`}
                  onClick={() => {
                    setEditError(null)
                    setEditing({ publicId: label.PublicId, name: label.Name, color: label.Color })
                  }}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Apagar ${label.Name}`}
                  onClick={() => setDeleting(label)}
                >
                  Apagar
                </Button>
              </li>
            ),
          )}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={deleting ? `Apagar “${deleting.Name}”` : 'Apagar etiqueta'}
        description={
          deleting && deleting.CardCount > 0
            ? `Ela sai de ${cardsLabel(deleting.CardCount)}. O histórico de cada um continua contando com o nome dela.`
            : 'Nenhum card usa esta etiqueta.'
        }
        confirmLabel="Apagar"
        onConfirm={() => (deleting ? remove(deleting) : undefined)}
      />
    </div>
  )
}

function cardsLabel(total: number): string {
  if (total === 0) return 'em nenhum card'
  return total === 1 ? '1 card' : `${total} cards`
}

function ordenar(lista: ProjectLabelViewModel[]): ProjectLabelViewModel[] {
  return [...lista].sort((a, b) => a.Name.localeCompare(b.Name, 'pt-BR', { sensitivity: 'base' }))
}
