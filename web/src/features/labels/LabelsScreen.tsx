import { useCallback, useEffect, useId, useState } from 'react'
import {
  type CardColor,
  type CardLabelViewModel,
  MAX_LABEL_NAME_LENGTH,
  type ProjectLabelViewModel,
} from '@/contracts'
import { describeError, projectLabelService } from '@/data'
import { Button } from '@/shared/components/Button'
import {
  CARD_COLOR_CLASSES,
  CARD_COLOR_NAMES,
  CardChip,
  CardColorPicker,
} from '@/shared/components/CardChip'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { MiniCard, VISIBLE_LABELS } from '@/shared/components/cardFace'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { LeaveGuard } from '@/shared/components/LeaveGuard'
import { LiveBadge } from '@/shared/components/LiveBadge'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'

/** O `PublicId` de mentira da etiqueta que se esta escrevendo no campo de criar. */
const NOVA = 'nova'

/** O titulo do card de exemplo: um relato comum, para as etiquetas serem o que se olha. */
const TITULO_DO_EXEMPLO = 'O botão de pagar não responde no celular'

interface Rascunho {
  name: string
  color: CardColor
}

/**
 * As etiquetas do projeto, para quem administra organizar.
 *
 * **O time cria ao etiquetar um card, e daqui tambem se cria.** Sem a criacao aqui,
 * nao dava para preparar o projeto antes de o time comecar; a criacao no card
 * continua, que e o caminho de todo dia. Aqui tambem se renomeia, se troca a cor e
 * se apaga: a etiqueta que nasceu com um nome torto, as duas que querem dizer a
 * mesma coisa.
 *
 * **Criar numa linha so**: o nome, o botao da cor (a paleta abre so quando se pede) e
 * Criar. Antes a paleta ficava sempre aberta, ocupando mais do que a lista.
 *
 * **Nome repetido diz "já existia"** e marca a que ja estava: a API devolve a existente
 * sem criar outra, e antes a tela so limpava o campo — parecia que tinha criado. A criada
 * tambem fica marcada: a lista e em ordem de nome, e ela entra no meio, longe do campo.
 *
 * **Duas colunas** (`EditorWithPreview`): a direita, um card de exemplo com as etiquetas,
 * a aberta primeiro e realcada — e o aviso de que o card mostra so tres, e o resto vira
 * "+N". Sem isso, quem criava a quarta procurava por ela no quadro.
 *
 * **Apagar tira a etiqueta de todos os cards**, e a tela diz de quantos antes de
 * apagar. O historico de cada card continua contando com o nome que ela tinha.
 */
export function LabelsScreen() {
  const project = useCurrentProject()
  const base = useId()
  const idEditar = (publicId: string) => `${base}-editar-${publicId}`
  const idEditor = (publicId: string) => `${base}-editor-${publicId}`
  const idLinha = (publicId: string) => `${base}-linha-${publicId}`
  const idCor = `${base}-cor`
  const idPaleta = `${base}-paleta`
  const idPrevia = `${base}-previa`
  // A ancora da busca da configuracao: o campo de criar.
  const idCampo = 'nova-etiqueta'

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

  /** A etiqueta aberta para editar, e o rascunho dela como esta escrito agora. */
  const [aberta, setAberta] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** A troca que espera a confirmacao: abrir outra etiqueta (`destino`), ou fechar (`null`). */
  const [troca, setTroca] = useState<{ destino: string | null } | null>(null)
  const [deleting, setDeleting] = useState<ProjectLabelViewModel | null>(null)

  const [name, setName] = useState('')
  const [color, setColor] = useState<CardColor>('Gray')
  const [paletaAberta, setPaletaAberta] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  /** A etiqueta marcada depois de criar: a nova, ou a que ja existia com aquele nome. */
  const [marcada, setMarcada] = useState<{ publicId: string; jaExistia: boolean } | null>(null)

  const etiquetaAberta = labels?.find((label) => label.PublicId === aberta)
  const sujo =
    rascunho !== null &&
    etiquetaAberta !== undefined &&
    (rascunho.name.trim() !== etiquetaAberta.Name || rascunho.color !== etiquetaAberta.Color)
  const podeSalvar = rascunho !== null && rascunho.name.trim().length > 0

  // A etiqueta marcada desce ate onde ela esta: com a lista longa, ela entrou fora da vista.
  useEffect(() => {
    if (!marcada) return
    document
      .getElementById(`${base}-linha-${marcada.publicId}`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [marcada, base])

  /** O foco vai para `id` depois do proximo desenho: o alvo so existe depois dele. */
  function devolverFoco(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  function irPara(destino: string | null) {
    setEditError(null)
    setAberta(destino)
    const alvo = labels?.find((label) => label.PublicId === destino)
    setRascunho(alvo ? { name: alvo.Name, color: alvo.Color } : null)
    if (destino !== null) setMarcada(null)
  }

  /** Abrir outra etiqueta, ou fechar a aberta. Com mudanca por salvar, pergunta antes. */
  function pedirTroca(destino: string | null) {
    if (destino === aberta) return
    if (sujo) setTroca({ destino })
    else irPara(destino)
  }

  function confirmarTroca() {
    if (!troca) return
    const anterior = aberta
    irPara(troca.destino)
    const alvo = troca.destino ?? anterior
    if (alvo) devolverFoco(idEditar(alvo))
  }

  function cancelar() {
    const alvo = aberta
    irPara(null)
    if (alvo) devolverFoco(idEditar(alvo))
  }

  async function create() {
    const value = name.trim()
    if (value.length === 0 || creating) return

    setCreating(true)
    setCreateError(null)

    try {
      // A API devolve a que ja existe com o mesmo nome, sem criar outra: aqui ela so
      // entra na lista se ainda nao estava, e a tela diz que ja existia.
      const criada = await projectLabelService.addLabel(project.PublicId, {
        Name: value,
        Color: color,
      })
      const jaExistia = (labels ?? []).some((item) => item.PublicId === criada.PublicId)
      setLabels((lista) =>
        ordenar([...(lista ?? []).filter((item) => item.PublicId !== criada.PublicId), criada]),
      )
      setMarcada({ publicId: criada.PublicId, jaExistia })
      setName('')
      setPaletaAberta(false)
    } catch (failure) {
      setCreateError(describeError(failure))
    } finally {
      setCreating(false)
    }
  }

  async function saveEdit() {
    if (aberta === null || !rascunho || saving) return

    const value = rascunho.name.trim()
    if (value.length === 0) return

    setSaving(true)
    setEditError(null)

    try {
      const saved = await projectLabelService.updateLabel(project.PublicId, aberta, {
        Name: value,
        Color: rascunho.color,
      })
      // Em ordem de nome, como a API devolve: renomear pode mudar o lugar dela.
      setLabels((lista) =>
        ordenar((lista ?? []).map((item) => (item.PublicId === saved.PublicId ? saved : item))),
      )
      irPara(null)
      devolverFoco(idEditar(saved.PublicId))
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
      if (aberta === label.PublicId) irPara(null)
      if (marcada?.publicId === label.PublicId) setMarcada(null)
      toast.done('Etiqueta apagada.')
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  /** A etiqueta como esta escrita agora: a do rascunho, na aberta. */
  function escrita(label: ProjectLabelViewModel): CardLabelViewModel {
    const emEdicao = aberta === label.PublicId && rascunho ? rascunho : null
    return {
      PublicId: label.PublicId,
      Name: emEdicao?.name.trim() || label.Name,
      Color: emEdicao?.color ?? label.Color,
    }
  }

  // A previa: o card com as etiquetas do projeto, em ordem de nome, e a que se olha
  // agora primeiro — a aberta, a que se esta escrevendo no campo, ou a recem-marcada —,
  // para ela nunca cair no "+N".
  const nomeNovo = name.trim()
  const novaNaPrevia: CardLabelViewModel | null =
    aberta === null && nomeNovo.length > 0 ? { PublicId: NOVA, Name: nomeNovo, Color: color } : null
  const escritas = (labels ?? []).map(escrita)
  const destaque = novaNaPrevia ? NOVA : (aberta ?? marcada?.publicId ?? null)
  const primeira = novaNaPrevia ?? escritas.find((label) => label.PublicId === destaque) ?? null
  const noCard = primeira
    ? [primeira, ...escritas.filter((label) => label.PublicId !== primeira.PublicId)]
    : escritas
  const sobram = Math.max(0, noCard.length - VISIBLE_LABELS)

  return (
    <div className="max-w-6xl">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-semibold text-screen tracking-tight">Etiquetas</h1>
        {/* O selo diz como esta tela grava: cada Criar, Salvar e Apagar ja chega ao quadro. */}
        <LiveBadge />
      </div>
      <p className="mb-2 text-body text-fg-muted">
        As etiquetas que o time põe nos cards para agrupar e filtrar.
      </p>

      <HowItWorks className="" bodyClassName="max-w-170">
        <p>
          O time também cria etiquetas ao etiquetar um card — é o caminho de todo dia. Aqui você
          prepara as do projeto antes de o time começar, corrige um nome torto ou junta as que
          querem dizer a mesma coisa.
        </p>
        <p>A lista vem em ordem de nome, como no card.</p>
        <p>
          Apagar tira a etiqueta de todos os cards de uma vez. O histórico de cada card continua
          contando com o nome que ela tinha.
        </p>
      </HowItWorks>

      <EditorWithPreview
        className="mt-6"
        preview={
          labels !== null ? (
            <section
              aria-labelledby={idPrevia}
              className="rounded-xl border border-border bg-surface-raised p-5"
            >
              <header className="mb-1 flex items-baseline justify-between gap-3">
                <h2 id={idPrevia} className="font-semibold text-fg text-lead">
                  Como aparece no card
                </h2>
                <span className="flex-none text-caption text-fg-muted">
                  {sujo ? 'ainda não salvo' : 'como o time vê'}
                </span>
              </header>
              <p className="mb-4 text-detail text-fg-muted leading-relaxed">
                {destaque !== null
                  ? 'A etiqueta que você está olhando vem primeiro, realçada, como está escrita agora.'
                  : 'Um card com as etiquetas do projeto, em ordem de nome.'}{' '}
                O card mostra só {VISIBLE_LABELS} etiquetas; as outras viram “+N”, com o nome delas
                ao passar o mouse.
              </p>
              <div className="rounded-lg border border-border bg-surface-sunken p-4">
                <MiniCard
                  className="mx-auto max-w-64"
                  title={TITULO_DO_EXEMPLO}
                  labels={noCard}
                  highlightLabel={destaque}
                />
              </div>
              <p className="mt-2 text-caption text-fg-muted leading-relaxed">
                {noCard.length === 0
                  ? 'Sem etiqueta, o card não mostra a linha delas.'
                  : sobram > 0
                    ? `Com todas as do projeto, ${sobram === 1 ? 'uma fica' : `${sobram} ficam`} no “+${sobram}”.`
                    : 'Todas cabem na frente do card.'}
              </p>
            </section>
          ) : loading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : null
        }
      >
        <section className="scroll-mt-6">
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
                  className="flex h-12 items-center rounded-xl border border-border bg-surface-raised px-3.5"
                >
                  <Skeleton className={`h-3 ${width}`} />
                </div>
              ))}
            </div>
          )}

          {labels !== null && (
            <div className="mb-4 rounded-xl border border-border border-dashed p-3">
              <label htmlFor={idCampo} className="mb-1.5 block text-detail text-fg-muted">
                Nova etiqueta
              </label>
              <div className="flex flex-wrap items-start gap-2">
                <TextField
                  id={idCampo}
                  className="min-w-0 flex-1 basis-48"
                  value={name}
                  onChange={(value) => {
                    setName(value)
                    if (createError) setCreateError(null)
                    if (marcada) setMarcada(null)
                  }}
                  placeholder="Ex.: pagamentos"
                  error={createError}
                  maxLength={MAX_LABEL_NAME_LENGTH}
                  disabled={creating}
                  onSubmit={create}
                />
                <button
                  id={idCor}
                  type="button"
                  aria-label={`Cor da nova etiqueta: ${CARD_COLOR_NAMES[color]}`}
                  aria-expanded={paletaAberta}
                  aria-controls={idPaleta}
                  disabled={creating}
                  onClick={() => setPaletaAberta((aberto) => !aberto)}
                  className="flex h-9 flex-none items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-detail text-fg enabled:hover:bg-surface-sunken disabled:opacity-60"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-4 flex-none rounded-full border',
                      CARD_COLOR_CLASSES[color],
                    )}
                  />
                  <span aria-hidden>{CARD_COLOR_NAMES[color]}</span>
                  <svg
                    viewBox="0 0 12 12"
                    className={cn(
                      'size-2.5 flex-none text-fg-muted transition-transform motion-reduce:transition-none',
                      paletaAberta && 'rotate-180',
                    )}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m3 4.5 3 3 3-3" />
                  </svg>
                </button>
                <Button
                  variant="primary"
                  disabled={nomeNovo.length === 0 || creating}
                  onClick={create}
                >
                  Criar etiqueta
                </Button>
              </div>

              {paletaAberta && (
                <div id={idPaleta} className="mt-3">
                  <CardColorPicker
                    label="Cor"
                    value={color}
                    onChange={(cor) => {
                      setColor(cor)
                      // Escolher fecha a paleta: e um botao de cor, e nao um painel fixo.
                      setPaletaAberta(false)
                      devolverFoco(idCor)
                    }}
                    disabled={creating}
                  />
                </div>
              )}

              {marcada?.jaExistia && (
                <p role="status" className="mt-2 text-detail text-fg-muted leading-relaxed">
                  “{labels.find((label) => label.PublicId === marcada.publicId)?.Name}” já existia —
                  está marcada na lista, com a cor dela. Para trocar a cor, use Editar.
                </p>
              )}
            </div>
          )}

          {labels !== null && labels.length === 0 && (
            <p className="rounded-xl border border-border border-dashed px-3.5 py-5 text-center text-detail text-fg-muted leading-relaxed">
              Ainda não há etiquetas. Crie acima, ou elas aparecem aqui assim que alguém do time
              etiquetar um card.
            </p>
          )}

          {labels !== null && labels.length > 0 && (
            <ul aria-label="Etiquetas do projeto" className="flex flex-col gap-2">
              {labels.map((label) => {
                const estaAberta = aberta === label.PublicId
                const agora = escrita(label)
                const estaMarcada = marcada?.publicId === label.PublicId
                return (
                  <li
                    key={label.PublicId}
                    id={idLinha(label.PublicId)}
                    data-marcada={estaMarcada || undefined}
                    className={cn(
                      'scroll-mt-6 rounded-xl border bg-surface-raised',
                      estaMarcada ? 'border-accent ring-1 ring-accent' : 'border-border',
                    )}
                  >
                    <div className="flex min-h-12 items-center gap-2 py-2 pr-2 pl-3">
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        <CardChip color={agora.Color}>{agora.Name}</CardChip>
                        {label.CardCount > 0 ? (
                          <span className="flex-none rounded border border-border px-1.5 py-0.5 text-caption text-fg tabular-nums">
                            {cardsLabel(label.CardCount)}
                          </span>
                        ) : (
                          <span className="flex-none text-caption text-fg-muted">
                            {cardsLabel(0)}
                          </span>
                        )}
                        {estaAberta && sujo && (
                          <span className="text-caption text-warn-fg">não salvo</span>
                        )}
                      </span>
                      <Button
                        id={idEditar(label.PublicId)}
                        size="sm"
                        variant="ghost"
                        aria-label={`Editar ${label.Name}`}
                        aria-expanded={estaAberta}
                        aria-controls={estaAberta ? idEditor(label.PublicId) : undefined}
                        onClick={() => pedirTroca(estaAberta ? null : label.PublicId)}
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
                    </div>

                    {estaAberta && rascunho && (
                      <div
                        id={idEditor(label.PublicId)}
                        className="flex flex-col gap-3 border-border border-t p-3"
                      >
                        <TextField
                          label="Nome"
                          value={rascunho.name}
                          onChange={(value) => {
                            setRascunho({ ...rascunho, name: value })
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
                          value={rascunho.color}
                          onChange={(cor) => setRascunho({ ...rascunho, color: cor })}
                          disabled={saving}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!podeSalvar || saving}
                            onClick={saveEdit}
                          >
                            Salvar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelar}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </EditorWithPreview>

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

      <ConfirmDialog
        open={troca !== null}
        onOpenChange={(open) => {
          if (!open) setTroca(null)
        }}
        title={`Descartar o que mudou em “${etiquetaAberta?.Name ?? 'etiqueta'}”?`}
        description="As mudanças desta etiqueta ainda não foram salvas e vão se perder. Para guardar, volte e clique em Salvar."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        primary="cancel"
        onConfirm={confirmarTroca}
      />

      <LeaveGuard when={sujo} onSave={podeSalvar ? () => void saveEdit() : undefined} />
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
