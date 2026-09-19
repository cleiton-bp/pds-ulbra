import { useState } from 'react'
import { MAX_COMMENT_LENGTH, type PublicReportViewModel } from '@/contracts'
import { describeError, reportService } from '@/data/publicIndex'
import { Button } from '@/shared/components/Button'
import { cn } from '@/shared/lib/cn'
import { formatDateTime, formatRelative } from '@/shared/lib/datetime'

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
 */
export function ConversationPanel({
  relato,
  protocolo,
  token,
  aoResponder,
}: {
  relato: PublicReportViewModel
  protocolo: string
  token: string
  aoResponder: (relato: PublicReportViewModel) => void
}) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const pedido = relato.InfoRequest
  const escrito = texto.trim()

  // Sem conversa e sem pergunta, não há bloco: uma seção vazia dizendo "ninguém
  // falou nada" ocupa a tela para não dizer coisa alguma.
  if (relato.Conversation.length === 0 && pedido === null) return null

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
    } finally {
      setEnviando(false)
    }
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
            </li>
          ))}
        </ul>
      )}

      {relato.CanReply && (
        <>
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

          {erro && <p className="mb-2.5 text-caption text-error-fg">{erro}</p>}

          <Button
            variant="primary"
            size="sm"
            disabled={enviando || escrito.length === 0}
            onClick={() => void enviar()}
          >
            {enviando ? 'Enviando…' : 'Responder'}
          </Button>
        </>
      )}
    </section>
  )
}
