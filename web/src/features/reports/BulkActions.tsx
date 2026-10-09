import { type ReactNode, useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  PublicOutcome,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
  SprintViewModel,
} from '@/contracts'
import {
  describeError,
  projectLabelService,
  projectPriorityService,
  projectReportService,
  projectTeamService,
} from '@/data'
import { CloseReportDialog } from '@/features/reports/CloseReportDialog'
import { cardHeadline, headlineText } from '@/features/reports/cardLook'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { DropdownGroup, DropdownItem, DropdownMenu } from '@/shared/components/DropdownMenu'
import { Modal } from '@/shared/components/Modal'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { cn } from '@/shared/lib/cn'

/** Um card que nao mudou no lote, e por que. */
export interface Falha {
  card: ReportSummaryViewModel
  motivo: string
}

/** A volta de um card que mudou: devolve o valor de antes, pela mesma rota. */
interface Volta {
  card: ReportSummaryViewModel
  desfazer: () => Promise<unknown>
}

/**
 * A mudanca de um card no lote: o pedido, e como voltar atras. Nulo e o card que ja
 * esta como se pediu, e fica de fora. Sem `desfazer`, o lote nao volta — a coluna que
 * encerra, que ja pergunta antes. Com `reabre`, so este card fica fora da volta: o
 * relato que o lote reabriu nao se encerra de novo sem desfecho.
 */
type Passo = (card: ReportSummaryViewModel) => {
  fazer: () => Promise<unknown>
  desfazer?: () => Promise<unknown>
  reabre?: boolean
} | null

/**
 * A volta que achou o card mudado depois do lote — por outra pessoa, ou por outro lote:
 * fica a mudanca mais nova, e o dialogo do que nao voltou diz isso.
 */
export class MudouDepoisDoLote extends Error {
  constructor() {
    super('Mudou depois do lote, e ficou como está.')
  }
}

/** O lote que terminou, e o que da para desfazer dele. */
export interface LoteFeito {
  mudaram: number
  falhas: Falha[]
  /** As voltas dos cards que mudaram; vazio quando o lote nao desfaz. */
  voltas: Volta[]
}

/**
 * A barra do lote: com cards marcados na lista, as mesmas mudancas para todos de uma
 * vez — a coluna, o responsavel, a prioridade, uma etiqueta a mais ou a menos e, com
 * as sprints ligadas, a sprint.
 *
 * **Card por card, pelas rotas de sempre**: as regras e as travas sao as de mexer num
 * card so, e um card recusado nao desfaz os outros. No fim, uma mensagem diz o que
 * mudou e em quantos — e quantos ja estavam assim —, e a tela (`aoTerminar`) mostra o
 * que nao mudou, com o porque: a barra pode sumir junto com os cards que sairam da
 * lista. Um de cada vez, na ordem da lista: a ordem em que chegam a sprint, ou ao topo
 * da coluna, e a de quem marcou.
 *
 * **O aviso do fim tem "Desfazer"**, por dez segundos: cada card volta ao valor que
 * tinha antes, card por card, pelas mesmas rotas (`useBulkUndo`). Um clique errado no
 * menu — os itens sao colados — mudava todos os marcados sem volta. Mover para a
 * coluna que encerra nao desfaz: ela pergunta antes, e voltar reabriria o relato.
 * **A volta confere antes**: rele o card e so devolve o campo que ainda esta como o lote
 * deixou — o que mudou nesses segundos fica, e entra no dialogo do que nao voltou.
 *
 * **Tirar da coluna que encerra pergunta antes**, como o quadro: o relato encerrado (e
 * nao confirmado por quem relatou) reabre. Ele fica fora do "Desfazer" — encerrar de
 * novo pede o desfecho —, e o aviso do fim diz isso.
 *
 * **A selecao fica** depois de cada mudanca: da para por o responsavel e depois a
 * prioridade nos mesmos cards. Os botoes ficam na tela enquanto o lote anda — o foco
 * nao cai para o comeco da pagina —, e um segundo pedido no meio e ignorado.
 *
 * **A coluna que encerra pergunta uma vez**: os relatos abertos da selecao encerram
 * todos com o mesmo desfecho e o mesmo motivo — e cada pessoa que relatou le o mesmo
 * texto.
 */
export function BulkActions({
  projectPublicId,
  cards,
  colunas,
  colunasFalharam = false,
  aoRecarregarColunas,
  sprints,
  carregados,
  total,
  comFiltro = false,
  aoSelecionarTodos,
  bloqueado = false,
  aoTerminar,
  aoDesfazer,
  aoLimpar,
}: {
  projectPublicId: string
  /** Os cards marcados, na ordem da lista. */
  cards: ReportSummaryViewModel[]
  colunas: ReportStateCountViewModel[] | null
  /** A contagem das colunas falhou: o "Mover para" diz isso, com "Tentar de novo". */
  colunasFalharam?: boolean
  aoRecarregarColunas?: () => void
  /** As sprints abertas, com as sprints ligadas; nulo sem elas. */
  sprints: SprintViewModel[] | null
  /** Quantos cards a lista ja trouxe — e quantos passam nos filtros. */
  carregados?: number
  total?: number
  /** Ha filtro ligado: o "selecionar todos" diz "os que passam nos filtros". */
  comFiltro?: boolean
  /** Le o resto da lista e marca todos. */
  aoSelecionarTodos?: () => Promise<void>
  /** A lista esta sendo relida: as acoes esperam o resultado novo. */
  bloqueado?: boolean
  /** O lote terminou: a tela rele o que mudou e mostra o que nao mudou. */
  aoTerminar: (resultado: LoteFeito) => void
  /** O "Desfazer" do aviso. Sem ele, o aviso nao oferece. */
  aoDesfazer?: (lote: LoteFeito) => void
  aoLimpar: () => void
}) {
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null)
  const ocupado = useRef(false)
  const [encerrar, setEncerrar] = useState<ReportStateCountViewModel | null>(null)
  const [reabrir, setReabrir] = useState<ReportStateCountViewModel | null>(null)
  const [selecionandoTodos, setSelecionandoTodos] = useState(false)

  const { data: time } = useAsyncResource(
    useCallback(() => projectTeamService.listMembers(projectPublicId), [projectPublicId]),
  )
  const { data: etiquetas } = useAsyncResource(
    useCallback(() => projectLabelService.listLabels(projectPublicId), [projectPublicId]),
  )
  const { data: prioridades } = useAsyncResource(
    useCallback(() => projectPriorityService.listPriorities(projectPublicId), [projectPublicId]),
  )

  const rodando = andamento !== null
  // So a releitura da lista e o "selecionar todos" travam os menus: durante o lote, o
  // segundo pedido ja e ignorado, e travar tiraria o foco do botao.
  const parado = bloqueado || selecionandoTodos

  /**
   * Muda card por card, e conta. Os pulados entram na lista do que nao mudou.
   * `mensagem` e o que o aviso do fim diz, com quantos mudaram: "Responsavel: Ana —
   * 2 cards". Os que ja estavam assim vao entre parenteses.
   */
  async function rodar(mensagem: (mudaram: number) => string, passo: Passo, pulados: Falha[] = []) {
    if (ocupado.current) return
    ocupado.current = true
    const naoMudaram = [...pulados]
    const fila = cards.filter((card) => !pulados.some((pulado) => pulado.card === card))
    let mudaram = 0
    let jaEstavam = 0
    let reabertos = 0
    const voltas: Volta[] = []
    let desfaz = true
    setAndamento({ feitos: 0, total: fila.length })
    for (const [i, card] of fila.entries()) {
      const pedido = passo(card)
      if (pedido === null) jaEstavam += 1
      else {
        try {
          await pedido.fazer()
          mudaram += 1
          if (pedido.reabre) reabertos += 1
          else if (pedido.desfazer) voltas.push({ card, desfazer: pedido.desfazer })
          else desfaz = false
        } catch (falha) {
          naoMudaram.push({ card, motivo: describeError(falha) })
        }
      }
      setAndamento({ feitos: i + 1, total: fila.length })
    }
    setAndamento(null)
    ocupado.current = false

    const lote: LoteFeito = { mudaram, falhas: naoMudaram, voltas: desfaz ? voltas : [] }
    if (mudaram > 0) {
      const ja =
        jaEstavam === 0
          ? ''
          : jaEstavam === 1
            ? ' (1 já estava assim)'
            : ` (${jaEstavam} já estavam assim)`
      // O relato reaberto nao volta: encerrar de novo pede o desfecho. O aviso diz isso,
      // em vez de prometer que tudo volta.
      const reabertosDizem =
        reabertos === 0
          ? ''
          : lote.voltas.length > 0
            ? reabertos === 1
              ? ' O relato reaberto fica fora do "Desfazer": encerrar de novo pede o desfecho.'
              : ` Os ${reabertos} relatos reabertos ficam fora do "Desfazer": encerrar de novo pede o desfecho.`
            : reabertos === 1
              ? ' O relato foi reaberto: encerrar de novo pede o desfecho.'
              : ` Os ${reabertos} relatos foram reabertos: encerrar de novo pede o desfecho.`
      toast.done(
        `${mensagem(mudaram)}${ja}.${reabertosDizem}`,
        aoDesfazer && lote.voltas.length > 0
          ? { action: { label: 'Desfazer', run: () => aoDesfazer(lote) } }
          : undefined,
      )
    } else if (naoMudaram.length === 0) toast.done('Os cards já estavam assim.')
    aoTerminar(lote)
  }

  /** "Responsavel: Ana — 2 cards". */
  const contados = (descricao: string) => (mudaram: number) =>
    `${descricao} — ${mudaram === 1 ? '1 card' : `${mudaram} cards`}`

  /**
   * As etiquetas sao gravadas inteiras: o card e lido na hora, e a mudanca vale sobre o
   * que ele tem agora — e nao sobre a lista da tela, que pode estar velha. Sem isso, a
   * etiqueta que outra pessoa pos no meio do lote sumia. Desfazer e a mudanca contraria,
   * do mesmo jeito.
   */
  async function trocarEtiquetas(card: ReportSummaryViewModel, mudar: (ids: string[]) => string[]) {
    const agora = await projectReportService.refreshReport(projectPublicId, card.PublicId)
    const antes = agora.Labels.map((dele) => dele.PublicId)
    const depois = [...new Set(mudar(antes))]
    if (depois.length === antes.length && depois.every((id) => antes.includes(id))) return
    await projectReportService.setLabels(projectPublicId, card.PublicId, { LabelPublicIds: depois })
  }

  /**
   * A volta de um campo: rele o card e so devolve o valor de antes se ele ainda esta
   * como o lote deixou. O que outra pessoa — ou outro lote — mudou nesses segundos fica.
   */
  function voltarSe(
    card: ReportSummaryViewModel,
    comoOLoteDeixou: (agora: ReportSummaryViewModel) => boolean,
    voltar: () => Promise<unknown>,
  ) {
    return async () => {
      const agora = await projectReportService.refreshReport(projectPublicId, card.PublicId)
      if (!comoOLoteDeixou(agora)) throw new MudouDepoisDoLote()
      return voltar()
    }
  }

  // Sair da coluna que encerra reabre o relato que quem relatou ainda nao confirmou — a
  // regra da API, quando uma coluna encerra. O confirmado so anda, como no quadro.
  const algumaEncerra = (colunas ?? []).some((linha) => linha.ClosesReport)
  const reabre = (card: ReportSummaryViewModel, coluna: ReportStateCountViewModel) =>
    algumaEncerra &&
    !coluna.ClosesReport &&
    card.Kind === 'Report' &&
    card.Closed &&
    !card.ClosureConfirmed &&
    card.StatePublicId !== coluna.StatePublicId

  function mover(
    coluna: ReportStateCountViewModel,
    fim?: { Outcome: PublicOutcome; Reason: string },
  ) {
    const estado = coluna.StatePublicId
    if (estado === null) return
    void rodar(contados(`Mover para ${coluna.StateName ?? 'a coluna'}`), (card) => {
      if (card.StatePublicId === estado) return null
      const antes = card.StatePublicId
      return {
        fazer: () =>
          projectReportService.moveReport(projectPublicId, card.PublicId, {
            StatePublicId: estado,
            ...(fim && card.Kind === 'Report' && !card.Closed ? fim : {}),
          }),
        // O relato que reabre fica fora da volta: ele perguntou antes, e encerrar de novo
        // pede o desfecho.
        reabre: reabre(card, coluna),
        // A coluna que encerra nao volta: ela perguntou antes, e voltar reabriria o
        // relato. O card que nao tinha coluna tambem nao: nao ha "sem coluna" para mover.
        desfazer:
          coluna.ClosesReport || antes === null
            ? undefined
            : voltarSe(
                card,
                (agora) => agora.StatePublicId === estado,
                () =>
                  projectReportService.moveReport(projectPublicId, card.PublicId, {
                    StatePublicId: antes,
                  }),
              ),
      }
    })
  }

  const abertos = encerrar
    ? cards.filter(
        (card) =>
          card.Kind === 'Report' && !card.Closed && card.StatePublicId !== encerrar.StatePublicId,
      )
    : []

  const reabrindo = reabrir ? cards.filter((card) => reabre(card, reabrir)) : []
  const queEncerra =
    (colunas ?? []).find((linha) => linha.ClosesReport)?.StateName ?? 'a coluna que encerra'

  const ativas = (colunas ?? []).filter((linha) => linha.StatePublicId !== null && linha.IsActive)
  const prioridadesAtivas = [...(prioridades ?? [])]
    .filter((prioridade) => prioridade.IsActive)
    .sort((a, b) => b.Position - a.Position)
  const etiquetasNosCards = (etiquetas ?? []).filter((etiqueta) =>
    cards.some((card) => card.Labels.some((dele) => dele.PublicId === etiqueta.PublicId)),
  )
  // Quem olha primeiro, com o "(voce)", como no filtro de responsavel.
  const pessoas = [...(time ?? [])].sort((a, b) => Number(b.IsYou) - Number(a.IsYou))

  // Todos os da pagina marcados, e ha mais na lista: o lote sairia pela metade sem que
  // ninguem percebesse. A barra diz isso e oferece o resto.
  const soAPagina =
    carregados !== undefined &&
    total !== undefined &&
    cards.length === carregados &&
    carregados < total

  const selecionarTodos = async () => {
    if (!aoSelecionarTodos) return
    setSelecionandoTodos(true)
    try {
      await aoSelecionarTodos()
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setSelecionandoTodos(false)
    }
  }

  const contagem = cards.length === 1 ? '1 selecionado' : `${cards.length} selecionados`

  return (
    // Presa embaixo da tela, depois da tabela: marcar a primeira caixa nao empurra as
    // linhas — o proximo clique cai onde a pessoa mirou. No celular, uma linha so: as
    // acoes rolam para o lado, e a barra nao cobre as linhas.
    <section
      aria-label="Ações em lote"
      className="sticky bottom-3 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-surface-raised px-3 py-2"
    >
      <span className="mr-1 font-medium text-detail text-fg tabular-nums">
        {soAPagina ? `${contagem} nesta página.` : contagem}
      </span>

      {soAPagina && aoSelecionarTodos && (
        <Button
          size="sm"
          variant="quiet"
          disabled={rodando || parado}
          onClick={() => void selecionarTodos()}
        >
          {selecionandoTodos
            ? 'Carregando…'
            : comFiltro
              ? `Selecionar os ${total} que passam nos filtros`
              : `Selecionar todos os ${total}`}
        </Button>
      )}

      {/* No celular, as acoes numa faixa so, que rola para o lado, abaixo da contagem e
          do "✕": duas linhas, e nao quatro cobrindo a lista. */}
      <div className="-mx-1 order-last flex min-w-0 flex-[1_1_100%] flex-nowrap items-center gap-2 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:flex-[0_1_auto] sm:flex-wrap sm:overflow-visible sm:px-0">
        <Acao rotulo="Mover para" desligada={parado}>
          {ativas.length === 0 ? (
            // Sem as colunas, o menu diz por que esta vazio — e, se a leitura falhou,
            // oferece ler de novo dali mesmo.
            <div className="px-2.5 py-2 text-detail text-fg-muted">
              {colunasFalharam
                ? 'Não deu para carregar as colunas agora.'
                : colunas === null
                  ? 'Carregando…'
                  : 'O projeto não tem coluna ativa.'}
              {colunasFalharam && aoRecarregarColunas && (
                <DropdownItem quiet onSelect={aoRecarregarColunas}>
                  Tentar de novo
                </DropdownItem>
              )}
            </div>
          ) : (
            ativas.map((coluna) => (
              <DropdownItem
                key={coluna.StatePublicId}
                onSelect={() => {
                  const abertosAqui = cards.some(
                    (card) =>
                      card.Kind === 'Report' &&
                      !card.Closed &&
                      card.StatePublicId !== coluna.StatePublicId,
                  )
                  if (coluna.ClosesReport && abertosAqui) setEncerrar(coluna)
                  else if (cards.some((card) => reabre(card, coluna))) setReabrir(coluna)
                  else mover(coluna)
                }}
              >
                {coluna.StateName}
              </DropdownItem>
            ))
          )}
        </Acao>

        <Acao rotulo="Responsável" desligada={parado}>
          {pessoas.map((pessoa) => {
            const nome = pessoa.Name ?? 'Pessoa sem nome'
            return (
              <DropdownItem
                key={pessoa.UserPublicId}
                onSelect={() =>
                  void rodar(contados(`Responsável: ${nome}`), (card) => {
                    if (card.Assignee?.UserPublicId === pessoa.UserPublicId) return null
                    const antes = card.Assignee?.UserPublicId ?? null
                    return {
                      fazer: () =>
                        projectReportService.setAssignee(projectPublicId, card.PublicId, {
                          UserPublicId: pessoa.UserPublicId,
                        }),
                      desfazer: voltarSe(
                        card,
                        (agora) => agora.Assignee?.UserPublicId === pessoa.UserPublicId,
                        () =>
                          projectReportService.setAssignee(projectPublicId, card.PublicId, {
                            UserPublicId: antes,
                          }),
                      ),
                    }
                  })
                }
              >
                {pessoa.IsYou ? `${nome} (você)` : nome}
              </DropdownItem>
            )
          })}
          <DropdownItem
            quiet
            onSelect={() =>
              void rodar(contados('Sem responsável'), (card) => {
                if (card.Assignee === null) return null
                const antes = card.Assignee.UserPublicId
                return {
                  fazer: () =>
                    projectReportService.setAssignee(projectPublicId, card.PublicId, {
                      UserPublicId: null,
                    }),
                  desfazer: voltarSe(
                    card,
                    (agora) => agora.Assignee === null,
                    () =>
                      projectReportService.setAssignee(projectPublicId, card.PublicId, {
                        UserPublicId: antes,
                      }),
                  ),
                }
              })
            }
          >
            Sem responsável
          </DropdownItem>
        </Acao>

        <Acao rotulo="Prioridade" desligada={parado}>
          {prioridadesAtivas.map((prioridade) => (
            <DropdownItem
              key={prioridade.PublicId}
              onSelect={() =>
                void rodar(contados(`Prioridade: ${prioridade.Name}`), (card) => {
                  if (card.Priority?.PublicId === prioridade.PublicId) return null
                  const antes = card.Priority?.PublicId ?? null
                  return {
                    fazer: () =>
                      projectReportService.setPriority(projectPublicId, card.PublicId, {
                        PriorityPublicId: prioridade.PublicId,
                      }),
                    desfazer: voltarSe(
                      card,
                      (agora) => agora.Priority?.PublicId === prioridade.PublicId,
                      () =>
                        projectReportService.setPriority(projectPublicId, card.PublicId, {
                          PriorityPublicId: antes,
                        }),
                    ),
                  }
                })
              }
            >
              {prioridade.Name}
            </DropdownItem>
          ))}
          <DropdownItem
            quiet
            onSelect={() =>
              void rodar(contados('Sem prioridade'), (card) => {
                if (card.Priority === null) return null
                const antes = card.Priority.PublicId
                return {
                  fazer: () =>
                    projectReportService.setPriority(projectPublicId, card.PublicId, {
                      PriorityPublicId: null,
                    }),
                  desfazer: voltarSe(
                    card,
                    (agora) => agora.Priority === null,
                    () =>
                      projectReportService.setPriority(projectPublicId, card.PublicId, {
                        PriorityPublicId: antes,
                      }),
                  ),
                }
              })
            }
          >
            Sem prioridade
          </DropdownItem>
        </Acao>

        {/* Adicionar junta a etiqueta as que o card ja tem; remover so oferece as que
            estao em algum card da selecao. As palavras sao as do card aberto. */}
        <Acao rotulo="Adicionar etiqueta" desligada={parado}>
          {(etiquetas ?? []).length === 0 ? (
            <p className="px-2.5 py-2 text-detail text-fg-muted">
              O projeto ainda não tem etiquetas.
            </p>
          ) : (
            (etiquetas ?? []).map((etiqueta) => (
              <DropdownItem
                key={etiqueta.PublicId}
                onSelect={() =>
                  void rodar(
                    (mudaram) =>
                      `Etiqueta ${etiqueta.Name} adicionada a ${mudaram === 1 ? '1 card' : `${mudaram} cards`}`,
                    (card) =>
                      card.Labels.some((dele) => dele.PublicId === etiqueta.PublicId)
                        ? null
                        : {
                            fazer: () =>
                              trocarEtiquetas(card, (ids) => [...ids, etiqueta.PublicId]),
                            desfazer: () =>
                              trocarEtiquetas(card, (ids) =>
                                ids.filter((id) => id !== etiqueta.PublicId),
                              ),
                          },
                  )
                }
              >
                {etiqueta.Name}
              </DropdownItem>
            ))
          )}
        </Acao>

        {etiquetasNosCards.length > 0 && (
          <Acao rotulo="Remover etiqueta" desligada={parado}>
            {etiquetasNosCards.map((etiqueta) => (
              <DropdownItem
                key={etiqueta.PublicId}
                onSelect={() =>
                  void rodar(
                    (mudaram) =>
                      `Etiqueta ${etiqueta.Name} removida de ${mudaram === 1 ? '1 card' : `${mudaram} cards`}`,
                    (card) =>
                      card.Labels.some((dele) => dele.PublicId === etiqueta.PublicId)
                        ? {
                            fazer: () =>
                              trocarEtiquetas(card, (ids) =>
                                ids.filter((id) => id !== etiqueta.PublicId),
                              ),
                            desfazer: () =>
                              trocarEtiquetas(card, (ids) => [...ids, etiqueta.PublicId]),
                          }
                        : null,
                  )
                }
              >
                {etiqueta.Name}
              </DropdownItem>
            ))}
          </Acao>
        )}

        {/* A subtarefa vai com o pai: fica de fora, e a lista do que nao mudou diz isso. */}
        {sprints !== null && (
          <Acao rotulo="Sprint" desligada={parado}>
            {[{ PublicId: null, Name: 'Backlog' }, ...sprints].map((sprint) => (
              <DropdownItem
                key={sprint.PublicId ?? 'backlog'}
                onSelect={() =>
                  void rodar(
                    contados(sprint.PublicId === null ? 'Para o backlog' : `Para a ${sprint.Name}`),
                    (card) => {
                      if ((card.Sprint?.PublicId ?? null) === sprint.PublicId) return null
                      const antes = card.Sprint?.PublicId ?? null
                      return {
                        fazer: () =>
                          projectReportService.setSprint(projectPublicId, card.PublicId, {
                            SprintPublicId: sprint.PublicId,
                          }),
                        desfazer: voltarSe(
                          card,
                          (agora) => (agora.Sprint?.PublicId ?? null) === sprint.PublicId,
                          () =>
                            projectReportService.setSprint(projectPublicId, card.PublicId, {
                              SprintPublicId: antes,
                            }),
                        ),
                      }
                    },
                    cards
                      .filter((card) => card.Parent !== null)
                      .map((card) => ({ card, motivo: 'A subtarefa vai com o card pai.' })),
                  )
                }
              >
                {sprint.Name}
              </DropdownItem>
            ))}
          </Acao>
        )}
      </div>

      {/* O andamento ao lado dos botoes, que ficam: o foco continua onde estava. */}
      <span role="status" className="text-detail text-fg-muted tabular-nums">
        {rodando ? `Mudando ${andamento.feitos} de ${andamento.total}…` : ''}
      </span>

      <Button
        size="sm"
        variant="quiet"
        disabled={rodando}
        onClick={aoLimpar}
        aria-label="Limpar seleção"
        className="ml-auto"
      >
        <span aria-hidden className="sm:hidden">
          ✕
        </span>
        <span aria-hidden className="hidden sm:inline">
          Limpar seleção
        </span>
      </Button>

      {encerrar && (
        <CloseReportDialog
          coluna={encerrar.StateName}
          lote={abertos.length}
          maisLeitores={abertos.length === 1 ? (abertos[0]?.DuplicateReporters ?? 0) : 0}
          encerrando={false}
          aoConfirmar={(outcome, reason) => {
            const coluna = encerrar
            setEncerrar(null)
            mover(coluna, { Outcome: outcome, Reason: reason })
          }}
          aoCancelar={() => setEncerrar(null)}
        />
      )}

      {/* Como o quadro: tirar da coluna que encerra reabre, e isso pergunta antes. */}
      {reabrir && (
        <ConfirmDialog
          open
          onOpenChange={(aberto) => {
            if (!aberto) setReabrir(null)
          }}
          tone="warn"
          title={
            reabrindo.length === 1
              ? `Reabrir o relato #${reabrindo[0]?.Number ?? ''}?`
              : `Reabrir ${reabrindo.length} relatos?`
          }
          description={
            reabrindo.length === 1
              ? `Tirar o #${reabrindo[0]?.Number ?? ''} de ${queEncerra} reabre o relato: quem relatou volta a ver o relato em andamento, e o motivo do encerramento sai da página de acompanhamento.`
              : `Tirar os ${reabrindo.length} relatos de ${queEncerra} reabre cada um: quem relatou volta a ver o relato em andamento, e o motivo do encerramento sai da página de acompanhamento.`
          }
          cancelLabel="Cancelar"
          confirmLabel="Reabrir e mover"
          onConfirm={() => {
            const coluna = reabrir
            setReabrir(null)
            mover(coluna)
          }}
        />
      )}
    </section>
  )
}

/**
 * O "Desfazer" do lote: devolve, card por card e pelas mesmas rotas, o valor que cada
 * um tinha antes — se o card ainda esta como o lote deixou. **Mora na tela, e nao na barra**: o aviso vive dez segundos, e a barra
 * pode ter sumido com os cards que sairam da lista. `depois` e lido na hora de usar —
 * a releitura da lista de agora, e nao a de quando o lote rodou.
 */
export function useBulkUndo(
  depois: () => void,
  aoFalhar: (resultado: { mudaram: number; falhas: Falha[] }) => void,
) {
  const [desfazendo, setDesfazendo] = useState<{ feitos: number; total: number } | null>(null)
  const ocupado = useRef(false)
  const atual = useRef({ depois, aoFalhar })
  atual.current = { depois, aoFalhar }

  const desfazer = useCallback(async (lote: LoteFeito) => {
    if (ocupado.current || lote.voltas.length === 0) return
    ocupado.current = true
    const total = lote.voltas.length
    const falhas: Falha[] = []
    let voltaram = 0
    setDesfazendo({ feitos: 0, total })
    for (const [i, volta] of lote.voltas.entries()) {
      try {
        await volta.desfazer()
        voltaram += 1
      } catch (falha) {
        falhas.push({
          card: volta.card,
          motivo: falha instanceof MudouDepoisDoLote ? falha.message : describeError(falha),
        })
      }
      setDesfazendo({ feitos: i + 1, total })
    }
    setDesfazendo(null)
    ocupado.current = false
    if (falhas.length > 0) atual.current.aoFalhar({ mudaram: voltaram, falhas })
    else
      toast.done(
        voltaram === 1
          ? 'Desfeito: o card voltou como estava.'
          : `Desfeito: os ${voltaram} cards voltaram como estavam.`,
      )
    atual.current.depois()
  }, [])

  return { desfazendo, desfazer }
}

/**
 * Os cards que nao mudaram no lote — ou que nao voltaram, no "Desfazer" —, com o
 * porque, e o link para abrir cada um. Mora na tela, e nao na barra: a barra some junto
 * com os cards que sairam da lista, e o dialogo iria junto.
 */
export function BulkFailures({
  mudaram,
  falhas,
  desfazendo = false,
  aoFechar,
}: {
  mudaram: number
  falhas: Falha[]
  /** As falhas sao do "Desfazer": os cards que nao voltaram. */
  desfazendo?: boolean
  aoFechar: () => void
}) {
  const titulo = desfazendo
    ? falhas.length === 1
      ? '1 card não voltou'
      : `${falhas.length} cards não voltaram`
    : falhas.length === 1
      ? '1 card não mudou'
      : `${falhas.length} cards não mudaram`
  const descricao = desfazendo
    ? mudaram > 0
      ? 'Os outros voltaram como estavam. Estes ficaram como estão:'
      : 'Estes ficaram como estão:'
    : mudaram > 0
      ? 'Os outros mudaram. Estes ficaram como estavam:'
      : 'Estes ficaram como estavam:'

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar()
      }}
      title={titulo}
      description={descricao}
      footer={
        <Button variant="primary" onClick={aoFechar}>
          Entendi
        </Button>
      }
    >
      <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {falhas.map(({ card, motivo }) => (
          <li key={card.PublicId} className="text-detail leading-snug">
            {/* O card abre dali: corrigir um por um era achar cada um na lista. */}
            <Link
              to={card.PublicId}
              onClick={aoFechar}
              className="text-fg underline-offset-2 hover:underline"
            >
              <span className="font-medium font-mono text-fg-muted">#{card.Number}</span>{' '}
              {headlineText(cardHeadline(card))}
            </Link>
            <span className="block text-fg-muted">{motivo}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/** Um botao da barra que abre a lista de escolhas. */
function Acao({
  rotulo,
  desligada = false,
  children,
}: {
  rotulo: string
  /**
   * A lista esta sendo relida: o menu espera o resultado novo, para ninguem mudar em
   * lote as linhas velhas. **Nao e `disabled`**: o botao desabilitado perde o foco, e
   * ele cairia no comeco da pagina — aqui o botao fica, e so nao abre.
   */
  desligada?: boolean
  children: ReactNode
}) {
  return (
    <DropdownMenu
      align="start"
      width="w-60"
      trigger={
        <button
          type="button"
          aria-disabled={desligada || undefined}
          // O menu abre no apertar e nas teclas: barrar os dois aqui o mantem fechado.
          onPointerDown={(evento) => {
            if (desligada) evento.preventDefault()
          }}
          onKeyDown={(evento) => {
            if (desligada && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(evento.key))
              evento.preventDefault()
          }}
          className={cn(
            'inline-flex h-8 flex-none items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 text-detail text-fg transition-colors hover:bg-surface-sunken',
            desligada && 'cursor-not-allowed opacity-60',
          )}
        >
          {rotulo}
          <svg
            viewBox="0 0 12 12"
            className="size-3 text-fg-muted"
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
      }
    >
      <DropdownGroup>
        <div className="max-h-72 overflow-y-auto">{children}</div>
      </DropdownGroup>
    </DropdownMenu>
  )
}
