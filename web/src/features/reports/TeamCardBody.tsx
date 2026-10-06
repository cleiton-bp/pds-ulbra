import { type ReactNode, useState } from 'react'
import {
  MAX_CARD_DESCRIPTION_LENGTH,
  MAX_CARD_TITLE_LENGTH,
  type ReportDetailViewModel,
  type ReportStateCountViewModel,
  type ReportSummaryViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { CardDetailLayout, DetailRow, DetailsBox } from '@/features/reports/CardDetailLayout'
import { CardFields } from '@/features/reports/CardFields'
import { ColumnSelect } from '@/features/reports/ColumnSelect'
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
  conversa,
  versao,
  aoMover,
  aoSalvo,
  aoComentar,
  antes,
  depois,
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
  conversa: ReportConversation
  versao: number
  aoMover: (statePublicId: string) => void
  /** O card mudou de texto ou de arquivo: quem abriu o dialogo e a lista se acertam. */
  aoSalvo: (card: ReportDetailViewModel) => void
  aoComentar: () => void
  /** O que vem antes do titulo — na subtarefa, o pai. */
  antes?: ReactNode
  /** O que vem depois da descricao — as subtarefas. */
  depois?: ReactNode
}) {
  const arquivado = card.ArchivedAt !== null
  const descricao = detalhe?.Description ?? null

  const [editando, setEditando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmandoArquivo, setConfirmandoArquivo] = useState(false)

  function editar() {
    setTitulo(card.Title ?? '')
    setTexto(descricao ?? '')
    setErro(null)
    setEditando(true)
  }

  async function salvar() {
    const novoTitulo = titulo.trim()
    if (novoTitulo.length === 0 || salvando) return

    setSalvando(true)
    setErro(null)

    try {
      const salvo = await projectReportService.editTeamCard(projectPublicId, reportPublicId, {
        Title: novoTitulo,
        Description: texto.trim().length > 0 ? texto : null,
      })
      aoSalvo(salvo)
      setEditando(false)
    } catch (falha) {
      // O texto continua no editor: quem escreveu tenta de novo sem reescrever.
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
      toast.error(describeError(falha))
    }
  }

  return (
    <>
      <CardDetailLayout
        cabeca={
          <>
            {antes}
            {editando ? (
              <div className="flex flex-col gap-4">
                <TextField
                  label="Título"
                  value={titulo}
                  onChange={(valor) => {
                    setTitulo(valor)
                    if (erro) setErro(null)
                  }}
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
                  rows={10}
                />
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={titulo.trim().length === 0 || salvando}
                    onClick={() => void salvar()}
                  >
                    {salvando ? 'Salvando…' : 'Salvar'}
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    disabled={salvando}
                    onClick={() => setEditando(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="mb-3 break-words font-semibold text-fg text-lead">{card.Title}</h3>
                {detalhe === null && !failed ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                ) : descricao ? (
                  <Markdown source={descricao} />
                ) : (
                  <p className="text-detail text-fg-muted">
                    {failed ? 'A descrição não carregou agora.' : 'Sem descrição.'}
                  </p>
                )}
              </div>
            )}
            {depois}
          </>
        }
        lado={
          <>
            <div className="flex flex-col items-start gap-2">
              {arquivado ? (
                <span className="rounded-full border border-warn-border bg-warn-surface px-2 py-px text-caption text-warn-fg">
                  Arquivado
                </span>
              ) : colunas && colunas.length > 0 ? (
                <ColumnSelect
                  colunas={colunas}
                  atual={card.StatePublicId}
                  disabled={movendo}
                  tone={statusTone(card.StatePublicId, colunas)}
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
            </div>

            {!editando && (
              <div className="flex flex-wrap gap-2">
                {arquivado ? (
                  <Button size="sm" onClick={() => void mudarArquivo(false)}>
                    Desarquivar
                  </Button>
                ) : (
                  <>
                    <Button size="sm" disabled={detalhe === null} onClick={editar}>
                      Editar
                    </Button>
                    <Button size="sm" variant="quiet" onClick={() => setConfirmandoArquivo(true)}>
                      Arquivar
                    </Button>
                  </>
                )}
              </div>
            )}

            <DetailsBox>
              {/* Escondidos enquanto o titulo e a descricao estao em edicao: os campos
                  gravam na hora, e "Cancelar" nao desfaria o que mudou neles no meio. */}
              {!editando && (
                <CardFields
                  projectPublicId={projectPublicId}
                  reportPublicId={reportPublicId}
                  card={card}
                  aoMudar={aoSalvo}
                />
              )}

              <dl
                className={`flex flex-col gap-1.5 ${editando ? '' : 'border-border border-t pt-3'}`}
              >
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
