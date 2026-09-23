import { useState } from 'react'
import {
  MAX_COMMENT_LENGTH,
  type PublicAttachmentViewModel,
  type PublicMediaSettingsViewModel,
  type PublicReportViewModel,
} from '@/contracts'
import { describeError, reportService } from '@/data/publicIndex'
import { AttachmentPicker, AttachmentProgress } from '@/embed/AttachmentPicker'
import { useAttachmentDraft } from '@/embed/useAttachmentDraft'
import { AttachmentGallery } from '@/shared/components/AttachmentGallery'
import { Button } from '@/shared/components/Button'
import { cn } from '@/shared/lib/cn'
import { formatDateTime, formatRelative } from '@/shared/lib/datetime'
import { toGalleryItem } from '@/tracking/TrackingAttachments'

/**
 * A conversa sobre o relato, e de quem é a vez.
 *
 * **"Volta para o relator" são dois casos, e não um.** Precisar de contexto e
 * recusar de fato são decisões opostas — e chegando iguais do outro lado, a pessoa
 * entende que acabou e para de responder. O relato morre por ruído, que é o
 * problema que este produto existe para resolver. Por isso o pedido de informação
 * tem bloco próprio, com cara de pergunta, e não uma linha no meio das outras.
 *
 * **O aviso do prazo está aqui porque não há para onde mandá-lo.** Sem canal de
 * comunicação, esta página é o único lugar onde a pessoa descobre qualquer coisa —
 * então o primeiro prazo não é um envio, é esta tela mudando de tom.
 *
 * **E ela diz que encerrado por falta de resposta continua reabrível.** Sem isso, o
 * aviso vira ameaça: quem não conseguiu responder a tempo acha que perdeu o
 * assunto, e o produto existe justamente para quem foi esquecido.
 *
 * **Escrever só quando há pergunta aberta.** Canal livre viraria uma caixa de
 * entrada sem dono e sem moderação — e moderação ficou de fora desta etapa de
 * propósito. A vez volta para a equipe assim que ela responde.
 *
 * **A resposta pode levar arquivo, e o arquivo nunca segura a resposta.** O texto é
 * gravado primeiro; os arquivos sobem depois, presos a ela. É o que a equipe mais
 * pede numa pergunta — "manda a tela" —, e o texto não pode depender do upload.
 */
export function ConversationPanel({
  relato,
  protocolo,
  token,
  aoResponder,
  media = null,
  anexosPorFala = new Map(),
  aoAnexar = () => {},
}: {
  relato: PublicReportViewModel
  protocolo: string
  token: string
  aoResponder: (relato: PublicReportViewModel) => void
  /** O que dá para anexar na resposta. Nulo: a resposta é só texto. */
  media?: PublicMediaSettingsViewModel | null
  /** Os arquivos de cada fala, pelo identificador dela. */
  anexosPorFala?: Map<string, PublicAttachmentViewModel[]>
  /** Os arquivos mudaram — subiu um, ou um endereço venceu. Quem monta a página relê. */
  aoAnexar?: () => void
}) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const draft = useAttachmentDraft(media, { forReply: true })
  const [subindo, setSubindo] = useState(false)
  const credenciais = { trackingCode: protocolo, token }

  const pedido = relato.InfoRequest
  const escrito = texto.trim()

  // Sem conversa e sem pergunta, não há bloco: uma seção vazia dizendo "ninguém
  // falou nada" ocupa a tela para não dizer coisa alguma.
  if (relato.Conversation.length === 0 && pedido === null) return null

  /**
   * Sobe os arquivos da resposta, e some com a lista quando todos foram.
   *
   * O que falhou fica, com "tentar de novo". O que foi aparece logo abaixo da
   * resposta, quando a página reler — a lista de envio sai de cena para não mostrar
   * o mesmo arquivo duas vezes.
   */
  async function subirAnexos() {
    setSubindo(true)
    await draft.enviarAnexos(credenciais, 0)
    aoAnexar()

    if (draft.atual().every((anexo) => anexo.status === 'done')) {
      draft.limpar()
      setSubindo(false)
    }
  }

  async function enviar() {
    if (escrito.length === 0 || enviando) return

    setEnviando(true)
    setErro(null)

    try {
      aoResponder(
        await reportService.replyToReport({
          TrackingCode: protocolo,
          Token: token,
          Body: escrito,
        }),
      )
      setTexto('')
    } catch (falha) {
      // Fica dentro do bloco: o que falhou foi a resposta dela, e não a página.
      setErro(describeError(falha))
      setEnviando(false)
      return
    }

    setEnviando(false)

    // **Depois da resposta gravada, e só então.** O texto já está do lado de lá;
    // os arquivos se prendem a ele.
    if (draft.atual().length > 0) await subirAnexos()
  }

  return (
    <section
      className={cn(
        'mt-5 rounded-xl border p-5',
        pedido ? 'border-warn-border bg-warn-surface' : 'border-border bg-surface-raised',
      )}
    >
      <h2 className={cn('mb-1 font-semibold text-lead', pedido ? 'text-warn-fg' : 'text-fg')}>
        {pedido ? 'A equipe precisa de uma informação sua' : 'Conversa sobre o seu relato'}
      </h2>

      {pedido && (
        <p className={cn('mb-4 text-detail leading-relaxed', 'text-warn-fg')}>
          {pedido.IsWarning
            ? 'Sem a sua resposta, este relato será encerrado em '
            : 'Se ninguém responder, este relato será encerrado em '}
          <strong className="font-medium">{formatDateTime(pedido.CloseAt)}</strong>.{' '}
          {/* Não é ameaça: encerrado assim continua reabrível, e dizer isso é o que
              impede a pessoa de achar que perdeu o assunto. */}
          Mesmo assim, você poderá reabrir por esta página depois.
        </p>
      )}

      {relato.Conversation.length > 0 && (
        <ul className="mb-4 flex flex-col gap-3.5">
          {relato.Conversation.map((fala) => (
            <li key={fala.PublicId}>
              <div className="mb-0.5 flex items-baseline gap-2 text-caption text-fg-muted">
                <span className="font-medium text-fg">
                  {fala.FromReporter ? 'Você' : 'A equipe'}
                </span>
                <time dateTime={fala.CreatedAt} title={formatDateTime(fala.CreatedAt)}>
                  {formatRelative(fala.CreatedAt)}
                </time>
              </div>
              {/* `whitespace-pre-wrap` pelo mesmo motivo do relato: quem escreveu
                  escreveu em linhas. */}
              <p className="whitespace-pre-wrap break-words text-body text-fg leading-relaxed">
                {fala.Body}
              </p>
              {/* Logo abaixo da fala que os trouxe: é o que diz que o print é a
                  resposta à pergunta, e não um anexo solto do relato. */}
              {(anexosPorFala.get(fala.PublicId)?.length ?? 0) > 0 && (
                <div className="mt-2">
                  <AttachmentGallery
                    onExpired={aoAnexar}
                    items={(anexosPorFala.get(fala.PublicId) ?? []).map(toGalleryItem)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {subindo && (
        <div className="mb-4">
          <AttachmentProgress
            anexos={draft.anexos}
            savedNote="A resposta foi enviada e o seu texto está salvo."
            onRetry={(anexo) =>
              void draft.enviarAnexo(credenciais, anexo, 0).then(() => {
                aoAnexar()
                if (draft.atual().every((atual) => atual.status === 'done')) {
                  draft.limpar()
                  setSubindo(false)
                }
              })
            }
          />
        </div>
      )}

      {relato.CanReply && (
        // Colar em qualquer lugar da resposta anexa — a pessoa cola com o foco onde
        // estiver. Texto colado continua sendo texto.
        <div onPaste={media ? draft.colar : undefined}>
          <label htmlFor="resposta" className="mb-1.5 block text-detail text-fg">
            A sua resposta
          </label>
          <textarea
            id="resposta"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            maxLength={MAX_COMMENT_LENGTH}
            disabled={enviando}
            rows={3}
            className="mb-3 block w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-2 text-body text-fg leading-relaxed disabled:opacity-60"
          />

          {media && !subindo && (
            <div className="mb-3">
              <AttachmentPicker
                media={media}
                anexos={draft.anexos}
                recusa={draft.recusa}
                onAdd={(arquivos) => void draft.adicionar(arquivos)}
                onRemove={draft.remover}
              />
            </div>
          )}

          {erro && <p className="mb-2.5 text-caption text-error-fg">{erro}</p>}

          <Button
            variant="primary"
            size="sm"
            disabled={enviando || escrito.length === 0}
            onClick={() => void enviar()}
          >
            {enviando ? 'Enviando…' : 'Responder'}
          </Button>
        </div>
      )}
    </section>
  )
}
