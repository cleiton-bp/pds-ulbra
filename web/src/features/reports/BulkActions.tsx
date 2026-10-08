import { type ReactNode, useCallback, useState } from 'react'
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
interface Falha {
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
 * card so, e um card recusado nao desfaz os outros. No fim, a barra diz quantos
 * mudaram, e um dialogo lista os que nao mudaram, com o porque. Um de cada vez, na
 * ordem da lista: a ordem em que chegam a sprint, ou ao topo da coluna, e a de quem
 * marcou.
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
  /** O lote terminou: a tela rele o que mudou e limpa a selecao. */
  aoTerminar: () => void
  aoLimpar: () => void
}) {
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null)
  const [falhas, setFalhas] = useState<Falha[] | null>(null)
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

  /** Muda card por card, e conta. Os pulados entram na lista do que nao mudou. */
  async function rodar(passo: Passo, pulados: Falha[] = []) {
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
    aoTerminar()
    if (mudaram > 0) toast.done(mudaram === 1 ? '1 card mudou.' : `${mudaram} cards mudaram.`)
    else if (naoMudaram.length === 0) toast.done('Os cards já estavam assim.')
    if (naoMudaram.length > 0) setFalhas(naoMudaram)
  }

  function mover(
    coluna: ReportStateCountViewModel,
    fim?: { Outcome: PublicOutcome; Reason: string },
  ) {
    const estado = coluna.StatePublicId
    if (estado === null) return
    void rodar((card) =>
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
    <section
      aria-label="Ações em lote"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-surface-raised px-3 py-2"
    >
      <span className="mr-1 font-medium text-detail text-fg tabular-nums">
        {cards.length === 1 ? '1 selecionado' : `${cards.length} selecionados`}
      </span>

      {rodando ? (
        <span role="status" className="text-detail text-fg-muted tabular-nums">
          Mudando {andamento.feitos} de {andamento.total}…
        </span>
      ) : (
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
                  void rodar((card) =>
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
                void rodar((card) =>
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
                  void rodar((card) =>
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
                void rodar((card) =>
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

          {/* Pôr junta a etiqueta as que o card ja tem; tirar so oferece as que estao em
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
                    void rodar((card) =>
                      card.Labels.some((dele) => dele.PublicId === etiqueta.PublicId)
                        ? null
                        : projectReportService.setLabels(projectPublicId, card.PublicId, {
                            LabelPublicIds: [
                              ...card.Labels.map((dele) => dele.PublicId),
                              etiqueta.PublicId,
                            ],
                          }),
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
                    void rodar((card) =>
                      card.Labels.some((dele) => dele.PublicId === etiqueta.PublicId)
                        ? projectReportService.setLabels(projectPublicId, card.PublicId, {
                            LabelPublicIds: card.Labels.map((dele) => dele.PublicId).filter(
                              (id) => id !== etiqueta.PublicId,
                            ),
                          })
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
      )}

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

      {falhas && (
        <Modal
          open
          onOpenChange={(aberto) => {
            if (!aberto) setFalhas(null)
          }}
          title={falhas.length === 1 ? '1 card não mudou' : `${falhas.length} cards não mudaram`}
          description="Os outros mudaram. Estes ficaram como estavam:"
          footer={
            <Button variant="primary" onClick={() => setFalhas(null)}>
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
      )}
    </section>
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
