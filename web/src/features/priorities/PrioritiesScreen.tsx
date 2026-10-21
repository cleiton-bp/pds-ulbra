import { useCallback, useEffect, useId, useState } from 'react'
import {
  type CardColor,
  type CardPriorityViewModel,
  MAX_PRIORITY_NAME_LENGTH,
  type ProjectPriorityViewModel,
} from '@/contracts'
import { describeError, projectPriorityService } from '@/data'
import { Button } from '@/shared/components/Button'
import { CARD_COLOR_NAMES, CardColorPicker } from '@/shared/components/CardChip'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { MiniCard, PriorityIcon } from '@/shared/components/cardFace'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { LeaveGuard } from '@/shared/components/LeaveGuard'
import { LiveBadge } from '@/shared/components/LiveBadge'
import { Skeleton } from '@/shared/components/Skeleton'
import { SortableListItem } from '@/shared/components/SortableListItem'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useClosingItem } from '@/shared/hooks/useClosingItem'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { useListOrder } from '@/shared/hooks/useListOrder'
import { cn } from '@/shared/lib/cn'

/** O que `aberta` guarda quando o item aberto e o de criar, e nao o de uma prioridade. */
const NOVA = 'nova'

/** O nome do acordeao desta tela: uma prioridade aberta de cada vez. */
const ACORDEAO = 'prioridades'

/** A cor com que a nova comeca: neutra, ate o time escolher. */
const COR_DA_NOVA: CardColor = 'Gray'

/** O titulo do card de exemplo: um relato comum, para a prioridade ser o que se olha. */
const TITULO_DO_EXEMPLO = 'O botão de pagar não responde no celular'

interface Rascunho {
  name: string
  color: CardColor
}

/**
 * As prioridades do projeto.
 *
 * **Os nomes sao do time**, como os estados: o projeto nasce com Baixa, Média, Alta
 * e Urgente, e o time renomeia, troca a cor, reordena ou cria outras. **O card nasce
 * sem prioridade** — escolher e decisao de alguem, e nao um padrao.
 *
 * **Duas colunas, como Tipos de relato** (`EditorWithPreview`): a esquerda a lista, a
 * direita o card de exemplo com o desenho real da prioridade — antes a lista mostrava um
 * chip colorido, e o card mostra as barras com o nome: a previa nao era a do quadro.
 *
 * **A regua ao lado da lista diz o sentido da ordem** (topo = menos urgente): antes so o
 * subtitulo dizia, e quem chegava pela lista arrastava ao contrario.
 *
 * **Cada prioridade e um item de acordeao** (`SortableListItem`): nome e cor valem no
 * Salvar dela, e trocar de item com rascunho pergunta antes. A paleta so aparece dentro
 * do item aberto — antes a de criar ficava sempre aberta no fim da tela.
 *
 * **Desativar, e nao apagar**: a prioridade continua nos cards que ja a tem e sai da
 * lista de escolha. **Reordenar e otimista** (`useListOrder`): a seta e o arrastar movem
 * na hora, gravam a lista inteira — com as desativadas, que tambem tem lugar — e a lista
 * volta se o servidor recusar.
 */
export function PrioritiesScreen() {
  const project = useCurrentProject()
  const base = useId()
  const idResumo = (publicId: string) => `${base}-resumo-${publicId}`
  const idAtiva = (publicId: string) => `${base}-ativa-${publicId}`
  const idNomeDaNova = `${base}-nome-nova`
  const idPrevia = `${base}-previa`
  const idEscolha = `${base}-escolha`
  // A ancora da busca da configuracao: o botao de criar e o caminho para a nova.
  const idNova = 'nova-prioridade'

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

  /** A prioridade aberta (`PublicId`, ou `NOVA`) e o rascunho dela, como esta escrito agora. */
  const [aberta, setAberta] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // O item que acabou de fechar continua desenhado ate o fim do movimento.
  const { closing: fechando, markClosing } = useClosingItem<Rascunho>()

  /** A troca que espera a confirmacao: abrir outra prioridade (`destino`), ou fechar (`null`). */
  const [troca, setTroca] = useState<{ destino: string | null } | null>(null)
  const [retiring, setRetiring] = useState<ProjectPriorityViewModel | null>(null)

  const ordem = useListOrder({
    items: priorities,
    setItems: setPriorities,
    idOf: (priority) => priority.PublicId,
    save: (Order) => projectPriorityService.reorderPriorities(project.PublicId, { Order }),
    busy: salvando,
    focusFallback: idResumo,
  })

  const prioridadeAberta =
    aberta !== null && aberta !== NOVA
      ? priorities?.find((priority) => priority.PublicId === aberta)
      : undefined
  const sujo =
    rascunho !== null &&
    (aberta === NOVA
      ? rascunho.name.trim().length > 0 || rascunho.color !== COR_DA_NOVA
      : prioridadeAberta !== undefined &&
        (rascunho.name.trim() !== prioridadeAberta.Name ||
          rascunho.color !== prioridadeAberta.Color))
  const podeSalvar = rascunho !== null && rascunho.name.trim().length > 0

  /** O foco vai para `id` depois do proximo desenho: o alvo so existe depois dele. */
  function devolverFoco(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  /** Abre `destino` (ou fecha tudo, com `null`) sem perguntar: quem pergunta e `pedirTroca`. */
  function irPara(destino: string | null) {
    if (aberta !== null && aberta !== NOVA && rascunho) markClosing(aberta, rascunho)
    setErro(null)
    setAberta(destino)
    if (destino === null) {
      setRascunho(null)
      return
    }
    const alvo = priorities?.find((priority) => priority.PublicId === destino)
    setRascunho(alvo ? { name: alvo.Name, color: alvo.Color } : { name: '', color: COR_DA_NOVA })
  }

  /** Abrir outra prioridade, ou fechar a aberta. Com mudanca por salvar, pergunta antes. */
  function pedirTroca(destino: string | null) {
    if (destino === aberta) return
    if (sujo) setTroca({ destino })
    else irPara(destino)
  }

  function confirmarTroca() {
    if (!troca) return
    const { destino } = troca
    const anterior = aberta
    irPara(destino)
    // A pergunta fechou: o foco vai para onde a pessoa ia, ou para o que ela fechou.
    if (destino === NOVA) devolverFoco(idNomeDaNova)
    else if (destino !== null) devolverFoco(idResumo(destino))
    else if (anterior === NOVA) devolverFoco(idNova)
    else if (anterior !== null) devolverFoco(idResumo(anterior))
  }

  /** Cancelar e desistir de proposito: fecha sem perguntar, e o foco volta a quem abriu. */
  function cancelar() {
    const alvo = aberta
    irPara(null)
    if (alvo === NOVA) devolverFoco(idNova)
    else if (alvo) devolverFoco(idResumo(alvo))
  }

  const trocar = (salva: ProjectPriorityViewModel) =>
    setPriorities((lista) =>
      (lista ?? []).map((item) => (item.PublicId === salva.PublicId ? salva : item)),
    )

  async function salvar() {
    if (aberta === null || !rascunho || salvando) return

    const nome = rascunho.name.trim()
    if (nome.length === 0) return

    setSalvando(true)
    setErro(null)

    try {
      if (aberta === NOVA) {
        const criada = await projectPriorityService.addPriority(project.PublicId, {
          Name: nome,
          Color: rascunho.color,
        })
        // Entra no fim, como a mais urgente: e onde a API a colocou.
        setPriorities((lista) => [...(lista ?? []), criada])
        irPara(null)
        devolverFoco(idResumo(criada.PublicId))
        return
      }

      const salva = await projectPriorityService.updatePriority(project.PublicId, aberta, {
        Name: nome,
        Color: rascunho.color,
      })
      trocar(salva)
      irPara(null)
      devolverFoco(idResumo(salva.PublicId))
    } catch (failure) {
      // Nome repetido, nome longo: e do editor, que e onde se corrige.
      setErro(describeError(failure))
    } finally {
      setSalvando(false)
    }
  }

  async function setActive(priority: ProjectPriorityViewModel, active: boolean) {
    try {
      trocar(
        active
          ? await projectPriorityService.activatePriority(project.PublicId, priority.PublicId)
          : await projectPriorityService.deactivatePriority(project.PublicId, priority.PublicId),
      )
      toast.done(active ? 'Prioridade de volta à lista.' : 'Prioridade desativada.')
      // "Desativar" e "Reativar" sao o mesmo lugar do cabecalho: o foco fica nele.
      devolverFoco(idAtiva(priority.PublicId))
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  /** O editor do item aberto: o mesmo para a prioridade salva e para a nova. */
  function editor(chave: string) {
    if (aberta === chave && rascunho) {
      return (
        <EditorDaPrioridade
          rascunho={rascunho}
          onChange={(mudanca) => {
            setRascunho((atual) => (atual ? { ...atual, ...mudanca } : atual))
            if (erro) setErro(null)
          }}
          isNew={chave === NOVA}
          nameId={chave === NOVA ? idNomeDaNova : undefined}
          salvando={salvando}
          erro={erro}
          onSalvar={() => void salvar()}
          onCancelar={cancelar}
        />
      )
    }
    if (fechando?.id === chave) {
      // So o desenho, para o movimento de fechar: nada aqui responde.
      return (
        <div inert>
          <EditorDaPrioridade
            rascunho={fechando.value}
            onChange={() => {}}
            isNew={false}
            salvando={false}
            erro={null}
            onSalvar={() => {}}
            onCancelar={() => {}}
          />
        </div>
      )
    }
    return null
  }

  /** A prioridade como esta escrita agora: a do rascunho, na aberta. */
  function escrita(priority: ProjectPriorityViewModel): CardPriorityViewModel {
    const emEdicao = aberta === priority.PublicId && rascunho ? rascunho : null
    return {
      PublicId: priority.PublicId,
      Name: emEdicao?.name.trim() || priority.Name,
      Color: emEdicao?.color ?? priority.Color,
      IsActive: priority.IsActive,
    }
  }

  const nova: CardPriorityViewModel | null =
    aberta === NOVA && rascunho
      ? {
          PublicId: NOVA,
          Name: rascunho.name.trim() || 'Nova prioridade',
          Color: rascunho.color,
          IsActive: true,
        }
      : null

  // A previa: a lista de escolha como o card a oferece — as ativas, na ordem, com o
  // rascunho no lugar —, e no card a aberta, ou a primeira da lista.
  const escritas = (priorities ?? []).map(escrita)
  const escolha = [...escritas.filter((priority) => priority.IsActive), ...(nova ? [nova] : [])]
  const noCard =
    nova ?? escritas.find((priority) => priority.PublicId === aberta) ?? escolha[0] ?? null

  const total = (priorities?.length ?? 0) + (nova ? 1 : 0)
  const nomeDaAberta = prioridadeAberta?.Name ?? (rascunho?.name.trim() || 'Nova prioridade')

  return (
    <div className="max-w-6xl">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-semibold text-screen tracking-tight">Prioridades</h1>
        {/* O selo diz como esta tela grava: cada Salvar, seta e Desativar ja chega ao quadro. */}
        <LiveBadge />
      </div>
      <p className="mb-2 text-body text-fg-muted">
        O quanto cada card importa, com as palavras da sua equipe.
      </p>

      <HowItWorks className="" bodyClassName="max-w-170">
        <p>O card nasce sem prioridade: escolher é decisão de alguém do time.</p>
        <p>
          A ordem é a da lista de escolha no card, da menos para a mais urgente. Para mudar, arraste
          pela alça à esquerda ou use as setas — vale na hora.
        </p>
        <p>
          Clique numa prioridade para abrir: uma de cada vez, e o nome e a cor valem no Salvar dela.
        </p>
        <p>
          Desativar tira a prioridade da lista de escolha sem mexer nos cards que já a têm — nem no
          histórico deles. Dá para trazer de volta quando quiser.
        </p>
      </HowItWorks>

      <EditorWithPreview
        className="mt-6"
        preview={
          priorities !== null ? (
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
                {aberta !== null
                  ? 'A prioridade aberta, como está escrita agora.'
                  : 'A primeira da lista. Abra outra para ver a dela.'}
              </p>
              <div className="rounded-lg border border-border bg-surface-sunken p-4">
                <MiniCard
                  className="mx-auto max-w-64"
                  title={TITULO_DO_EXEMPLO}
                  priority={noCard}
                />
              </div>

              <h3 id={idEscolha} className="mt-5 mb-2 font-medium text-detail text-fg">
                A lista de escolha no card
              </h3>
              <ul
                aria-labelledby={idEscolha}
                className="overflow-hidden rounded-lg border border-border bg-surface text-body"
              >
                <li className="px-3 py-1.5 text-fg-muted">Sem prioridade</li>
                {escolha.map((priority) => (
                  <li
                    key={priority.PublicId}
                    className={cn(
                      'border-border border-t px-3 py-1.5 text-fg',
                      priority.PublicId === noCard?.PublicId && 'bg-surface-sunken',
                    )}
                  >
                    <PriorityIcon priority={priority} />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-caption text-fg-muted leading-relaxed">
                Na ordem da lista, sem as desativadas: elas ficam só nos cards que já as têm.
              </p>
            </section>
          ) : loading ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : null
        }
      >
        <section id="prioridades" className="scroll-mt-6">
          <h2 className="mb-1 font-semibold text-lead">Da menos para a mais urgente</h2>
          <p className="mb-4 text-detail text-fg-muted leading-relaxed">
            A ordem é a da lista de escolha no card.
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
                  className="flex h-16 items-center rounded-xl border border-border bg-surface-raised px-4"
                >
                  <Skeleton className={`h-3 ${width}`} />
                </div>
              ))}
            </div>
          )}

          {priorities !== null && total === 0 && (
            <p className="mb-4 rounded-xl border border-border border-dashed px-4 py-5 text-center text-detail text-fg-muted leading-relaxed">
              Ainda não há prioridades. Crie a primeira: o card continua nascendo sem nenhuma.
            </p>
          )}

          {priorities !== null && total > 0 && (
            <div className="mb-4 flex gap-2">
              {total > 1 && <Regua />}
              <ol
                aria-label="Prioridades, da menos para a mais urgente"
                className="flex min-w-0 flex-1 flex-col gap-2"
              >
                {priorities.map((priority, index) => {
                  const estaAberta = aberta === priority.PublicId
                  const agora = escrita(priority)
                  const resumo = priority.IsActive
                    ? `${CARD_COLOR_NAMES[agora.Color]} · na lista de escolha`
                    : `${CARD_COLOR_NAMES[agora.Color]} · fora da lista de escolha, fica nos cards que já a têm`
                  return (
                    <SortableListItem
                      key={priority.PublicId}
                      accordion={ACORDEAO}
                      summaryId={idResumo(priority.PublicId)}
                      open={estaAberta}
                      onRequestToggle={() => pedirTroca(estaAberta ? null : priority.PublicId)}
                      // O selo "Desativada" ja diz que ela saiu: o nome vai sem o "(desativada)"
                      // que o card escreve.
                      name={<PriorityIcon priority={{ ...agora, IsActive: true }} />}
                      summary={resumo}
                      summaryTitle={resumo}
                      inactive={!priority.IsActive}
                      unsaved={estaAberta && sujo}
                      order={ordem.itemProps(index, priority.Name)}
                      tags={priority.IsActive ? null : <Selo>Desativada</Selo>}
                      actionsSpace="double"
                      actions={
                        <span className="flex items-center gap-1">
                          {/* Abrir pelo nome ja funciona; o Editar diz que da para mudar, e
                              fecha o item aberto, como o Editar das Etiquetas. */}
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Editar ${priority.Name}`}
                            aria-expanded={estaAberta}
                            onClick={() => pedirTroca(estaAberta ? null : priority.PublicId)}
                          >
                            Editar
                          </Button>
                          {priority.IsActive ? (
                            <Button
                              id={idAtiva(priority.PublicId)}
                              size="sm"
                              variant="ghost"
                              aria-label={`Desativar ${priority.Name}`}
                              onClick={() => setRetiring(priority)}
                            >
                              Desativar
                            </Button>
                          ) : (
                            <Button
                              id={idAtiva(priority.PublicId)}
                              size="sm"
                              variant="ghost"
                              aria-label={`Reativar ${priority.Name}`}
                              onClick={() => void setActive(priority, true)}
                            >
                              Reativar
                            </Button>
                          )}
                        </span>
                      }
                    >
                      {editor(priority.PublicId)}
                    </SortableListItem>
                  )
                })}

                {nova && (
                  <SortableListItem
                    accordion={ACORDEAO}
                    summaryId={idResumo(NOVA)}
                    open
                    onRequestToggle={() => pedirTroca(null)}
                    name={<PriorityIcon priority={nova} />}
                    summary={`${CARD_COLOR_NAMES[nova.Color]} · entra no fim, como a mais urgente`}
                    isNew
                    unsaved={sujo}
                  >
                    {editor(NOVA)}
                  </SortableListItem>
                )}
              </ol>
            </div>
          )}

          {priorities !== null && aberta !== NOVA && (
            <Button id={idNova} disabled={salvando} onClick={() => pedirTroca(NOVA)}>
              Nova prioridade
            </Button>
          )}
        </section>
      </EditorWithPreview>

      <ConfirmDialog
        open={retiring !== null}
        onOpenChange={(open) => {
          if (!open) setRetiring(null)
        }}
        title="Desativar prioridade"
        description="Ela sai da lista de escolha, mas continua nos cards que já a têm — e no histórico deles. Dá para trazer de volta quando quiser."
        confirmLabel="Desativar"
        onConfirm={() => (retiring ? setActive(retiring, false) : undefined)}
      />

      <ConfirmDialog
        open={troca !== null}
        onOpenChange={(open) => {
          if (!open) setTroca(null)
        }}
        title={`Descartar o que mudou em “${nomeDaAberta}”?`}
        description="As mudanças desta prioridade ainda não foram salvas e vão se perder. Para guardar, volte e clique em Salvar."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        primary="cancel"
        onConfirm={confirmarTroca}
      />

      <LeaveGuard when={sujo} onSave={podeSalvar ? () => void salvar() : undefined} />
    </div>
  )
}

/** Nome e cor da prioridade aberta, com Salvar e Cancelar. */
function EditorDaPrioridade({
  rascunho,
  onChange,
  isNew,
  nameId,
  salvando,
  erro,
  onSalvar,
  onCancelar,
}: {
  rascunho: Rascunho
  onChange: (mudanca: Partial<Rascunho>) => void
  isNew: boolean
  /** O `id` do nome da nova: o foco vai para ele quando ela abre depois de uma pergunta. */
  nameId?: string
  salvando: boolean
  erro: string | null
  onSalvar: () => void
  onCancelar: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <TextField
        id={nameId}
        label="Nome"
        value={rascunho.name}
        onChange={(name) => onChange({ name })}
        placeholder={isNew ? 'Bloqueante' : undefined}
        error={erro}
        maxLength={MAX_PRIORITY_NAME_LENGTH}
        disabled={salvando}
        autoFocus
        onSubmit={onSalvar}
      />
      <CardColorPicker
        label="Cor"
        value={rascunho.color}
        onChange={(color) => onChange({ color })}
        disabled={salvando}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={rascunho.name.trim().length === 0 || salvando}
          onClick={onSalvar}
        >
          {isNew ? 'Criar prioridade' : 'Salvar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

/**
 * A regua ao lado da lista: o topo e a menos urgente, o fim a mais. Fora do leitor de
 * tela, porque o nome da lista ja diz o mesmo — e a regua repetida a cada item cansaria.
 */
function Regua() {
  return (
    <div
      aria-hidden
      data-regua
      className="flex w-14 flex-none flex-col items-center gap-1 py-2 text-center text-caption text-fg-muted leading-tight"
    >
      <span>menos urgente</span>
      <span className="w-px flex-1 bg-border" />
      <svg
        viewBox="0 0 12 12"
        className="size-3 flex-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 2v8M3 7l3 3 3-3" />
      </svg>
      <span>mais urgente</span>
    </div>
  )
}

/** O selo do item, embaixo do nome: "Desativada". O mesmo desenho das Colunas. */
function Selo({ children }: { children: string }) {
  return (
    <span className="rounded border border-border px-1.5 py-0.5 text-caption text-fg-muted">
      {children}
    </span>
  )
}
