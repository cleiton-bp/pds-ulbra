import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import {
  MAX_CARD_DESCRIPTION_LENGTH,
  MAX_CARD_TITLE_LENGTH,
  type ReportDetailViewModel,
  type ReportStateCountViewModel,
  type ReportSummaryViewModel,
  type SprintViewModel,
} from '@/contracts'
import { describeError, isPanelError, projectReportService } from '@/data'
import { CardDetailLayout, DetailRow, DetailsBox } from '@/features/reports/CardDetailLayout'
import { CardFields } from '@/features/reports/CardFields'
import { ColumnSelect } from '@/features/reports/ColumnSelect'
import { useCardDraft, useDiscardQuestion } from '@/features/reports/cardDrafts'
import { StatusLozenge, statusTone } from '@/features/reports/cardLook'
import { ReportComments, type ReportConversation } from '@/features/reports/ReportComments'
import { ReportHistory } from '@/features/reports/ReportHistory'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Markdown } from '@/shared/components/Markdown'
import { MarkdownEditor } from '@/shared/components/MarkdownEditor'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { formatDateTime } from '@/shared/lib/datetime'

/** O titulo e a descricao, como estavam quando a edicao abriu — ou como outra pessoa os salvou. */
interface Texto {
  titulo: string
  descricao: string | null
}

/**
 * O card do time, aberto.
 *
 * **So o que existe para ele.** Nao ha protocolo, pagina de onde veio, etapa publica,
 * pergunta a quem relatou nem encerramento — nao ha ninguem do lado de fora. Ha o
 * numero, o titulo, a descricao, a coluna, a conversa do time e a historia.
 *
 * **Mover para a ultima coluna e so mover.** O encerramento existe para dizer a quem
 * relatou o que aconteceu; aqui nao ha a quem dizer, e o seletor nunca abre o
 * dialogo do motivo.
 *
 * **Editar e no lugar.** O "Editar" fica ao lado do titulo (como o "Reescrever" do
 * relato), e clicar no titulo ou na descricao tambem entra na edicao, com o foco no
 * campo clicado. **Os campos da direita continuam a vista**: eles gravam sozinhos, e
 * ajustar a prioridade enquanto se escreve e o gesto comum — o "Descartar o texto" so
 * desfaz o titulo e a descricao.
 *
 * **Duas pessoas editando**: a gravacao leva o texto de onde partiu, e a API recusa
 * se outra pessoa salvou no meio. A tela avisa — tambem antes, quando a versao nova
 * chega ao vivo — e a pessoa escolhe entre a versao nova e a dela. Sem isso, a ultima
 * a salvar apagava a outra em silencio.
 *
 * **Arquivado se le e se comenta.** Editar e mover pedem desarquivar antes — a API
 * recusa do mesmo jeito; esconder os controles so poupa a viagem.
 */
export function TeamCardBody({
  projectPublicId,
  reportPublicId,
  card,
  detalhe,
  failed,
  colunas,
  movendo,
  destino = null,
  conversa,
  versao,
  aoMover,
  aoSalvo,
  aoComentar,
  aoTentarDeNovo,
  antes,
  depois,
  sprints = null,
  configuracao = 0,
  soonDays,
}: {
  projectPublicId: string
  reportPublicId: string
  /** O que ha de mais novo sobre o card: o resumo da lista, ou a resposta da ultima acao. */
  card: ReportSummaryViewModel
  /** O detalhe, quando chegou — e ele que traz a descricao e quem criou. */
  detalhe: ReportDetailViewModel | null
  failed: boolean
  colunas: ReportStateCountViewModel[] | null
  movendo: boolean
  /** A coluna escolhida enquanto o movimento grava: o seletor ja a mostra. */
  destino?: string | null
  conversa: ReportConversation
  versao: number
  aoMover: (statePublicId: string) => void
  /** O card mudou de texto ou de arquivo: quem abriu o dialogo e a lista se acertam. */
  aoSalvo: (card: ReportDetailViewModel) => void
  aoComentar: () => void
  /** O detalhe nao carregou: tenta de novo. */
  aoTentarDeNovo: () => void
  /** As sprints que nao fecharam, com a sprint ligada. */
  sprints?: SprintViewModel[] | null
  /** Sobe quando a configuracao do projeto mudou: as listas dos campos sao relidas. */
  configuracao?: number
  /** A regra do prazo perto (Ciclo), para o destaque do prazo. */
  soonDays?: number
  /** O que vem antes do titulo — na subtarefa, o pai. */
  antes?: ReactNode
  /** O que vem depois da descricao — as subtarefas e os vinculos. */
  depois?: ReactNode
}) {
  const arquivado = card.ArchivedAt !== null
  const descricao = detalhe?.Description ?? null

  const [editando, setEditando] = useState<'titulo' | 'descricao' | null>(null)
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmandoArquivo, setConfirmandoArquivo] = useState(false)

  // De onde a edicao partiu, e a versao que outra pessoa salvou no meio, quando houve.
  const [base, setBase] = useState<Texto | null>(null)
  const [conflito, setConflito] = useState<(Texto & { autor: string | null }) | null>(null)

  const mudou =
    editando !== null &&
    base !== null &&
    (titulo.trim() !== base.titulo || texto.trim() !== (base.descricao ?? '').trim())

  function editar(campo: 'titulo' | 'descricao') {
    if (arquivado || detalhe === null) return
    setTitulo(card.Title ?? '')
    setTexto(descricao ?? '')
    setBase({ titulo: card.Title ?? '', descricao })
    setConflito(null)
    setErro(null)
    setEditando(campo)
  }

  function sair() {
    setEditando(null)
    setBase(null)
    setConflito(null)
    setErro(null)
  }

  // O Esc com o foco na edicao sai dela, e o card fica; com o texto mudado, pergunta.
  // Fechar o card com a edicao mudada tambem pergunta.
  const perguntar = useDiscardQuestion()
  const area = useRef<HTMLDivElement>(null)
  useCardDraft(
    {
      sujo: mudou,
      cancelar: editando ? () => (mudou ? perguntar(sair) : sair()) : undefined,
    },
    area,
  )

  /**
   * A versao que outra pessoa salvou, com o nome de quem salvou — o da ultima edicao
   * do historico, que a releitura nao traz. Sem o nome, "Outra pessoa".
   */
  function avisarConflito(versao_: Texto) {
    setConflito({ ...versao_, autor: null })
    projectReportService
      .listReportHistory(projectPublicId, reportPublicId)
      .then((linhas) => {
        const ultima = [...linhas].reverse().find((linha) => linha.Type === 'TeamCardEdited')
        if (ultima?.AuthorName)
          setConflito((agora) => (agora ? { ...agora, autor: ultima.AuthorName } : agora))
      })
      .catch(() => {})
  }

  // A versao nova chegou ao vivo enquanto a edicao esta aberta: avisa antes de a
  // pessoa salvar por cima.
  const tituloAtual = card.Title ?? ''
  // biome-ignore lint/correctness/useExhaustiveDependencies: o gatilho e o texto que chega de fora.
  useEffect(() => {
    if (editando === null || base === null || conflito !== null || detalhe === null) return
    if (tituloAtual === base.titulo && (descricao ?? '') === (base.descricao ?? '')) return
    avisarConflito({ titulo: tituloAtual, descricao })
  }, [tituloAtual, descricao])

  async function salvar() {
    const novoTitulo = titulo.trim()
    if (novoTitulo.length === 0 || salvando || conflito !== null || base === null) return

    setSalvando(true)
    setErro(null)

    try {
      const salvo = await projectReportService.editTeamCard(projectPublicId, reportPublicId, {
        Title: novoTitulo,
        Description: texto.trim().length > 0 ? texto : null,
        Base: { Title: base.titulo, Description: base.descricao },
      })
      aoSalvo(salvo)
      sair()
    } catch (falha) {
      // O texto continua no editor: quem escreveu tenta de novo sem reescrever.
      if (isPanelError(falha) && falha.status === 409) {
        // Recusado: pode ser outra pessoa ter salvo no meio. A versao de agora diz.
        try {
          const agora = await projectReportService.refreshReport(projectPublicId, reportPublicId)
          aoSalvo(agora)
          if (
            (agora.Title ?? '') !== base.titulo ||
            (agora.Description ?? '') !== (base.descricao ?? '')
          ) {
            avisarConflito({ titulo: agora.Title ?? '', descricao: agora.Description })
            return
          }
        } catch {
          // Fica a mensagem da recusa.
        }
      }
      setErro(describeError(falha))
    } finally {
      setSalvando(false)
    }
  }

  async function mudarArquivo(arquivar: boolean) {
    try {
      const salvo = await projectReportService.setArchived(projectPublicId, reportPublicId, {
        Archived: arquivar,
      })
      aoSalvo(salvo)
      toast.done(
        arquivar ? `#${salvo.Number} arquivado.` : `#${salvo.Number} de volta ao Trabalho.`,
      )
    } catch (falha) {
      toast.error(
        `${arquivar ? 'Não deu para arquivar' : 'Não deu para desarquivar'} o #${card.Number}. ${describeError(falha)}`,
      )
    }
  }

  // O clique no titulo ou na descricao entra na edicao — menos no link de dentro dela,
  // e menos quando a pessoa estava selecionando texto para copiar.
  function cliqueParaEditar(evento: MouseEvent, campo: 'titulo' | 'descricao') {
    if ((evento.target as Element).closest('a')) return
    if ((window.getSelection()?.toString() ?? '').length > 0) return
    editar(campo)
  }

  const podeEditar = !arquivado && detalhe !== null

  return (
    <>
      <CardDetailLayout
        cabeca={
          <>
            {antes}
            {editando ? (
              <div ref={area} className="flex flex-col gap-4">
                {conflito && (
                  <div
                    role="alert"
                    className="rounded-lg border border-warn-border bg-warn-surface px-3 py-2.5 text-detail text-warn-fg"
                  >
                    <p className="mb-2">
                      {conflito.autor ?? 'Outra pessoa'} salvou uma nova versão enquanto você
                      editava.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setTitulo(conflito.titulo)
                          setTexto(conflito.descricao ?? '')
                          setBase({ titulo: conflito.titulo, descricao: conflito.descricao })
                          setConflito(null)
                        }}
                      >
                        Usar a versão nova
                      </Button>
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => {
                          // Manter a minha e salvar por cima sabendo: a base passa a ser a nova.
                          setBase({ titulo: conflito.titulo, descricao: conflito.descricao })
                          setConflito(null)
                        }}
                      >
                        Manter a minha
                      </Button>
                    </div>
                  </div>
                )}
                <TextField
                  label="Título"
                  value={titulo}
                  onChange={(valor) => {
                    setTitulo(valor)
                    if (erro) setErro(null)
                  }}
                  onSubmit={() => void salvar()}
                  autoFocus={editando === 'titulo'}
                  maxLength={MAX_CARD_TITLE_LENGTH}
                  disabled={salvando}
                  error={erro}
                />
                <MarkdownEditor
                  label="Descrição"
                  value={texto}
                  onChange={setTexto}
                  maxLength={MAX_CARD_DESCRIPTION_LENGTH}
                  disabled={salvando}
                  autoFocus={editando === 'descricao'}
                  rows={10}
                />
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={titulo.trim().length === 0 || salvando || conflito !== null}
                    onClick={() => void salvar()}
                  >
                    {salvando ? 'Salvando…' : 'Salvar'}
                  </Button>
                  <Button variant="quiet" size="sm" disabled={salvando} onClick={sair}>
                    Descartar o texto
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-start justify-between gap-3">
                  {/* O teclado entra pelo botao "Editar" ao lado; o clique no titulo e
                      o atalho do mouse. */}
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: o teclado usa o botao Editar */}
                  <h3
                    onClick={
                      podeEditar ? (evento) => cliqueParaEditar(evento, 'titulo') : undefined
                    }
                    className={`min-w-0 break-words font-semibold text-fg text-notice ${podeEditar ? 'cursor-text' : ''}`}
                  >
                    {card.Title}
                  </h3>
                  {!arquivado && (
                    <Button
                      size="sm"
                      variant="quiet"
                      disabled={detalhe === null}
                      onClick={() => editar('titulo')}
                    >
                      Editar
                    </Button>
                  )}
                </div>
                {detalhe === null && !failed ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                ) : failed && detalhe === null ? (
                  <p className="text-detail text-fg-muted">
                    A descrição não carregou.{' '}
                    <button
                      type="button"
                      onClick={aoTentarDeNovo}
                      className="underline underline-offset-2 hover:text-fg"
                    >
                      Tentar de novo
                    </button>
                  </p>
                ) : (
                  // biome-ignore lint/a11y/noStaticElementInteractions: o teclado usa o botao Editar
                  // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado usa o botao Editar
                  <div
                    onClick={
                      podeEditar ? (evento) => cliqueParaEditar(evento, 'descricao') : undefined
                    }
                    className={podeEditar ? 'cursor-text' : undefined}
                  >
                    {descricao ? (
                      <Markdown source={descricao} />
                    ) : (
                      <p className="text-detail text-fg-muted">
                        {podeEditar ? 'Sem descrição. Clique para escrever.' : 'Sem descrição.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        }
        depois={depois}
        lado={
          <>
            <div className="flex flex-col items-start gap-1">
              {arquivado ? (
                <span className="rounded-full border border-warn-border bg-warn-surface px-2 py-px text-caption text-warn-fg">
                  Arquivado
                </span>
              ) : colunas && colunas.length > 0 ? (
                <ColumnSelect
                  colunas={colunas}
                  atual={destino ?? card.StatePublicId}
                  disabled={movendo}
                  tone={statusTone(destino ?? card.StatePublicId, colunas)}
                  aoEscolher={aoMover}
                />
              ) : (
                card.StateName && (
                  <StatusLozenge
                    name={card.StateName}
                    tone={statusTone(card.StatePublicId, colunas)}
                  />
                )
              )}
              {destino !== null && (
                <span role="status" className="text-caption text-fg-muted">
                  Movendo…
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {arquivado ? (
                <Button size="sm" onClick={() => void mudarArquivo(false)}>
                  Desarquivar
                </Button>
              ) : (
                <Button size="sm" variant="quiet" onClick={() => setConfirmandoArquivo(true)}>
                  Arquivar
                </Button>
              )}
            </div>

            <DetailsBox>
              {/* Sempre a vista, tambem com o texto em edicao: os campos gravam na hora,
                  e o "Descartar o texto" so desfaz o titulo e a descricao. */}
              <CardFields
                projectPublicId={projectPublicId}
                reportPublicId={reportPublicId}
                card={card}
                aoMudar={aoSalvo}
                configuracao={configuracao}
                sprints={sprints}
                soonDays={soonDays}
              />

              <dl className="flex flex-col gap-1.5 border-border border-t pt-3">
                <DetailRow
                  label="Criado"
                  value={
                    <>
                      <span className="tabular-nums">{formatDateTime(card.CreatedAt)}</span>
                      {detalhe?.CreatedByName && (
                        <span className="text-fg-muted">, por {detalhe.CreatedByName}</span>
                      )}
                    </>
                  }
                />
              </dl>
            </DetailsBox>
          </>
        }
        atividade={
          <>
            <ReportComments
              projectPublicId={projectPublicId}
              reportPublicId={reportPublicId}
              conversa={conversa}
              aoComentar={aoComentar}
              paraQuemRelatou="nenhum"
            />

            <ReportHistory
              projectPublicId={projectPublicId}
              reportPublicId={reportPublicId}
              versao={versao}
            />
          </>
        }
      />

      <ConfirmDialog
        open={confirmandoArquivo}
        onOpenChange={setConfirmandoArquivo}
        title={`Arquivar #${card.Number}`}
        description="O card sai da tela de Trabalho. Continua aberto em Arquivados para ler, comentar e desarquivar."
        confirmLabel="Arquivar"
        onConfirm={() => mudarArquivo(true)}
      />
    </>
  )
}
