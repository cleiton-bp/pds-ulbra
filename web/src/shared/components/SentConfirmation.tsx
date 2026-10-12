import { renderWidgetText, type WidgetTextValues } from '@/shared/lib/widgetText'

/**
 * O que quem relata le logo depois de enviar: o texto de confirmacao do projeto, com as
 * variaveis trocadas, e o protocolo em destaque.
 *
 * Mora em `shared` porque o quadro do widget e as previas do painel mostram a mesma
 * coisa: a previa do formulario nunca envia, e sem esta peca a confirmacao so seria
 * vista depois de um relato de verdade.
 *
 * **Sao dois blocos soltos (`<>`), e nao um embrulho**: quem usa ja tem a coluna com o
 * espaco entre os blocos, e uma caixa a mais mudaria o espacamento do quadro.
 */
export function SentConfirmation({
  message,
  values,
  trackingCode,
}: {
  /** O texto do projeto, com as variaveis ainda por trocar. */
  message: string
  /** Os valores de agora: o nome, o protocolo, o tipo, o projeto. */
  values: WidgetTextValues
  trackingCode: string
}) {
  return (
    <>
      <div>
        {/* As variaveis trocadas aqui, depois de enviar, que e quando os valores existem.
            Texto puro: o nome e o que a pessoa digitou. */}
        <p className="text-body text-fg leading-normal">{renderWidgetText(message, values)}</p>
      </div>

      <div className="rounded-lg border border-border bg-surface-raised p-4">
        <p className="mb-1.5 text-detail text-fg-muted">Protocolo</p>
        <p className="font-mono text-fg text-lead tracking-wide">{trackingCode}</p>
      </div>
    </>
  )
}
