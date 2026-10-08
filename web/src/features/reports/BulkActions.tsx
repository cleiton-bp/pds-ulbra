import { type ReactNode, useCallback, useRef, useState } from 'react'
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
import { cardHeadline } from '@/features/reports/cardLook'
import { Button } from '@/shared/components/Button'
import { DropdownGroup, DropdownItem, DropdownMenu } from '@/shared/components/DropdownMenu'
import { Modal } from '@/shared/components/Modal'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

/** Um card que nao mudou no lote, e por que. */
export interface Falha {
  card: ReportSummaryViewModel
  motivo: string
}

/** A mudanca de um card no lote; nulo e o card que ja esta como se pediu, e fica de fora. */
type Passo = (card: ReportSummaryViewModel) => Promise<unknown> | null

/**
 * A barra do lote: com cards marcados na lista, as mesmas mudancas para todos de uma
 * vez — a coluna, o responsavel, a prioridade, uma etiqueta a mais ou a menos e, com
 * as sprints ligadas, a sprint.
 *
 * **Card por card, pelas rotas de sempre**: as regras e as travas sao as de mexer num
 * card so, e um card recusado nao desfaz os outros. No fim, uma mensagem diz o que
 * mudou e em quantos, e a tela (`aoTerminar`) mostra o que nao mudou, com o porque —
 * a barra pode sumir junto com os cards que sairam da lista. Um de cada vez, na ordem
 * da lista: a ordem em que chegam a sprint, ou ao topo da coluna, e a de quem marcou.
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
  sprints,
  aoTerminar,
  aoLimpar,
}: {
  projectPublicId: string
  /** Os cards marcados, na ordem da lista. */
  cards: ReportSummaryViewModel[]
  colunas: ReportStateCountViewModel[] | null
  /** As sprints abertas, com as sprints ligadas; nulo sem elas. */
  sprints: SprintViewModel[] | null
  /** O lote terminou: a tela rele o que mudou e mostra o que nao mudou. */
  aoTerminar: (resultado: { mudaram: number; falhas: Falha[] }) => void
  aoLimpar: () => void
}) {
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null)
  const ocupado = useRef(false)
  const [encerrar, setEncerrar] = useState<ReportStateCountViewModel | null>(null)

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

  /**
   * Muda card por card, e conta. Os pulados entram na lista do que nao mudou.
   * `descricao` e o que a mensagem do fim diz: "Responsavel: Ana".
   */
  async function rodar(descricao: string, passo: Passo, pulados: Falha[] = []) {
    if (ocupado.current) return
    ocupado.current = true
    const naoMudaram = [...pulados]
    const fila = cards.filter((card) => !pulados.some((pulado) => pulado.card === card))
    let mudaram = 0
    setAndamento({ feitos: 0, total: fila.length })
    for (const [i, card] of fila.entries()) {
      const pedido = passo(card)
      if (pedido !== null) {
        try {
          await pedido
          mudaram += 1
        } catch (falha) {
          naoMudaram.push({ card, motivo: describeError(falha) })
        }
      }
      setAndamento({ feitos: i + 1, total: fila.length })
    }
    setAndamento(null)
    ocupado.current = false
    if (mudaram > 0) toast.done(`${descricao} — ${mudaram === 1 ? '1 card' : `${mudaram} cards`}.`)
    else if (naoMudaram.length === 0) toast.done('Os cards já estavam assim.')
    aoTerminar({ mudaram, falhas: naoMudaram })
  }

  /**
   * As etiquetas sao gravadas inteiras: o card e lido na hora, e a mudanca vale sobre o
   * que ele tem agora — e nao sobre a lista da tela, que pode estar velha. Sem isso, a
   * etiqueta que outra pessoa pos no meio do lote sumia.
   */
  async function trocarEtiquetas(card: ReportSummaryViewModel, mudar: (ids: string[]) => string[]) {
    const agora = await projectReportService.refreshReport(projectPublicId, card.PublicId)
    const antes = agora.Labels.map((dele) => dele.PublicId)
    const depois = [...new Set(mudar(antes))]
    if (depois.length === antes.length && depois.every((id) => antes.includes(id))) return
    await projectReportService.setLabels(projectPublicId, card.PublicId, { LabelPublicIds: depois })
  }

  function mover(
    coluna: ReportStateCountViewModel,
    fim?: { Outcome: PublicOutcome; Reason: string },
  ) {
    const estado = coluna.StatePublicId
    if (estado === null) return
    void rodar(`Mover para ${coluna.StateName ?? 'a coluna'}`, (card) =>
      card.StatePublicId === estado
        ? null
        : projectReportService.moveReport(projectPublicId, card.PublicId, {
            StatePublicId: estado,
            ...(fim && card.Kind === 'Report' && !card.Closed ? fim : {}),
          }),
    )
  }

  const abertos = encerrar
    ? cards.filter(
        (card) =>
          card.Kind === 'Report' && !card.Closed && card.StatePublicId !== encerrar.StatePublicId,
      )
    : []

  const ativas = (colunas ?? []).filter((linha) => linha.StatePublicId !== null && linha.IsActive)
  const prioridadesAtivas = [...(prioridades ?? [])]
    .filter((prioridade) => prioridade.IsActive)
    .sort((a, b) => b.Position - a.Position)
  const etiquetasNosCards = (etiquetas ?? []).filter((etiqueta) =>
    cards.some((card) => card.Labels.some((dele) => dele.PublicId === etiqueta.PublicId)),
  )

  return (
    // Presa embaixo da tela, depois da tabela: marcar a primeira caixa nao empurra as
    // linhas — o proximo clique cai onde a pessoa mirou.
    <section
      aria-label="Ações em lote"
      className="sticky bottom-3 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-surface-raised px-3 py-2"
    >
      <span className="mr-1 font-medium text-detail text-fg tabular-nums">
        {cards.length === 1 ? '1 selecionado' : `${cards.length} selecionados`}
      </span>

      {
        <>
          <Acao rotulo="Mover para">
            {ativas.map((coluna) => (
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
                  else mover(coluna)
                }}
              >
                {coluna.StateName}
              </DropdownItem>
            ))}
          </Acao>

          <Acao rotulo="Responsável">
            {(time ?? []).map((pessoa) => (
              <DropdownItem
                key={pessoa.UserPublicId}
                onSelect={() =>
                  void rodar(`Responsável: ${pessoa.Name ?? 'Pessoa sem nome'}`, (card) =>
                    card.Assignee?.UserPublicId === pessoa.UserPublicId
                      ? null
                      : projectReportService.setAssignee(projectPublicId, card.PublicId, {
                          UserPublicId: pessoa.UserPublicId,
                        }),
                  )
                }
              >
                {pessoa.Name ?? 'Pessoa sem nome'}
              </DropdownItem>
            ))}
            <DropdownItem
              quiet
              onSelect={() =>
                void rodar('Sem responsável', (card) =>
                  card.Assignee === null
                    ? null
                    : projectReportService.setAssignee(projectPublicId, card.PublicId, {
                        UserPublicId: null,
                      }),
                )
              }
            >
              Sem responsável
            </DropdownItem>
          </Acao>

          <Acao rotulo="Prioridade">
            {prioridadesAtivas.map((prioridade) => (
              <DropdownItem
                key={prioridade.PublicId}
                onSelect={() =>
                  void rodar(`Prioridade: ${prioridade.Name}`, (card) =>
                    card.Priority?.PublicId === prioridade.PublicId
                      ? null
                      : projectReportService.setPriority(projectPublicId, card.PublicId, {
                          PriorityPublicId: prioridade.PublicId,
                        }),
                  )
                }
              >
                {prioridade.Name}
              </DropdownItem>
            ))}
            <DropdownItem
              quiet
              onSelect={() =>
                void rodar('Sem prioridade', (card) =>
                  card.Priority === null
                    ? null
                    : projectReportService.setPriority(projectPublicId, card.PublicId, {
                        PriorityPublicId: null,
                      }),
                )
              }
            >
              Sem prioridade
            </DropdownItem>
          </Acao>

          {/* Por junta a etiqueta as que o card ja tem; tirar so oferece as que estao em
              algum card da selecao. */}
          <Acao rotulo="Pôr etiqueta">
            {(etiquetas ?? []).length === 0 ? (
              <p className="px-2.5 py-2 text-detail text-fg-muted">
                O projeto ainda não tem etiquetas.
              </p>
            ) : (
              (etiquetas ?? []).map((etiqueta) => (
                <DropdownItem
                  key={etiqueta.PublicId}
                  onSelect={() =>
                    void rodar(`Etiqueta ${etiqueta.Name} posta`, (card) =>
                      card.Labels.some((dele) => dele.PublicId === etiqueta.PublicId)
                        ? null
                        : trocarEtiquetas(card, (ids) => [...ids, etiqueta.PublicId]),
                    )
                  }
                >
                  {etiqueta.Name}
                </DropdownItem>
              ))
            )}
          </Acao>

          {etiquetasNosCards.length > 0 && (
            <Acao rotulo="Tirar etiqueta">
              {etiquetasNosCards.map((etiqueta) => (
                <DropdownItem
                  key={etiqueta.PublicId}
                  onSelect={() =>
                    void rodar(`Etiqueta ${etiqueta.Name} tirada`, (card) =>
                      card.Labels.some((dele) => dele.PublicId === etiqueta.PublicId)
                        ? trocarEtiquetas(card, (ids) =>
                            ids.filter((id) => id !== etiqueta.PublicId),
                          )
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
            <Acao rotulo="Sprint">
              {[{ PublicId: null, Name: 'Backlog' }, ...sprints].map((sprint) => (
                <DropdownItem
                  key={sprint.PublicId ?? 'backlog'}
                  onSelect={() =>
                    void rodar(
                      sprint.PublicId === null ? 'Para o backlog' : `Para a ${sprint.Name}`,
                      (card) =>
                        (card.Sprint?.PublicId ?? null) === sprint.PublicId
                          ? null
                          : projectReportService.setSprint(projectPublicId, card.PublicId, {
                              SprintPublicId: sprint.PublicId,
                            }),
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
        </>
      }

      {/* O andamento ao lado dos botoes, que ficam: o foco continua onde estava. */}
      <span role="status" className="text-detail text-fg-muted tabular-nums">
        {rodando ? `Mudando ${andamento.feitos} de ${andamento.total}…` : ''}
      </span>

      <Button size="sm" variant="quiet" disabled={rodando} onClick={aoLimpar} className="ml-auto">
        Limpar seleção
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
    </section>
  )
}

/**
 * Os cards que nao mudaram no lote, com o porque. Mora na tela, e nao na barra: a barra
 * some junto com os cards que sairam da lista, e o dialogo iria junto.
 */
export function BulkFailures({
  mudaram,
  falhas,
  aoFechar,
}: {
  mudaram: number
  falhas: Falha[]
  aoFechar: () => void
}) {
  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar()
      }}
      title={falhas.length === 1 ? '1 card não mudou' : `${falhas.length} cards não mudaram`}
      description={
        mudaram > 0
          ? 'Os outros mudaram. Estes ficaram como estavam:'
          : 'Estes ficaram como estavam:'
      }
      footer={
        <Button variant="primary" onClick={aoFechar}>
          Entendi
        </Button>
      }
    >
      <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {falhas.map(({ card, motivo }) => (
          <li key={card.PublicId} className="text-detail leading-snug">
            <span className="font-medium font-mono text-fg-muted">#{card.Number}</span>{' '}
            <span className="text-fg">{cardHeadline(card).text}</span>
            <span className="block text-fg-muted">{motivo}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/** Um botao da barra que abre a lista de escolhas. */
function Acao({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <DropdownMenu
      align="start"
      width="w-60"
      trigger={
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-detail text-fg transition-colors hover:bg-surface-sunken"
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
