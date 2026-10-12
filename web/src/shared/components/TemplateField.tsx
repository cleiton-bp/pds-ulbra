import { useId, useRef } from 'react'
import {
  renderWidgetText,
  type WidgetTextValues,
  type WidgetTextVariable,
} from '@/shared/lib/widgetText'

/** Como cada variavel aparece no botao: o nome dela em portugues, sem as chaves. */
const ROTULO: Record<WidgetTextVariable, string> = {
  primeiroNome: 'primeiro nome',
  protocolo: 'protocolo',
  tipo: 'tipo',
  projeto: 'projeto',
  etapa: 'etapa',
}

/** O texto usa o primeiro nome — e so ai a linha "sem nome" diz alguma coisa. */
const USA_NOME = /\{\{\s*primeiroNome\s*(?:\||\}\})/

interface TemplateFieldProps {
  /** O `id` do campo, quando alguem precisa apontar para ele (`tela#campo`). */
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  maxLength: number
  /**
   * As variaveis que este texto aceita. Vazio e um texto comprido sem variavel:
   * sem botoes e sem previa.
   */
  variables?: readonly WidgetTextVariable[]
  /** Os valores de exemplo da previa. */
  sample?: WidgetTextValues
  className?: string
}

/**
 * Um texto da ferramenta em mais de uma linha, com as variaveis a um clique e a
 * previa logo embaixo.
 *
 * **Os botoes poem a variavel onde esta o cursor**, ja escrita certo: digitar
 * `{{primeiroNome}}` de cabeca e o jeito mais facil de errar uma letra e so
 * descobrir na gravacao. **A previa troca com valores de exemplo** pela mesma funcao
 * que o quadro e a pagina usam — o que se ve aqui e o que vai aparecer.
 */
export function TemplateField({
  id,
  label,
  value,
  onChange,
  maxLength,
  variables = [],
  sample = {},
  className,
}: TemplateFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const campo = useRef<HTMLTextAreaElement>(null)

  function inserir(variavel: WidgetTextVariable) {
    const el = campo.current
    const trecho = `{{${variavel}}}`
    const inicio = el?.selectionStart ?? value.length
    const fim = el?.selectionEnd ?? value.length

    // Cortar no teto partiria a variavel no meio, e o que sobrasse seria recusado
    // ao publicar. Sem espaco, nada entra.
    if (value.length - (fim - inicio) + trecho.length > maxLength) return

    onChange(value.slice(0, inicio) + trecho + value.slice(fim))

    // O cursor depois da variavel, como se ela tivesse sido digitada. O valor novo
    // so chega ao campo no proximo desenho, e so depois a posicao vale.
    requestAnimationFrame(() => {
      const posicao = inicio + trecho.length
      el?.focus()
      el?.setSelectionRange(posicao, posicao)
    })
  }

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1.5 block text-detail text-fg-muted">
        {label}
      </label>

      <textarea
        ref={campo}
        id={fieldId}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        className="w-full resize-y rounded-lg border border-border bg-surface-raised px-3 py-2 text-body text-fg leading-normal placeholder:text-fg-placeholder"
      />

      {variables.length > 0 && (
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-fg-muted">Inserir:</span>
            {variables.map((variavel) => (
              <button
                key={variavel}
                type="button"
                title={`Insere {{${variavel}}} onde está o cursor`}
                onClick={() => inserir(variavel)}
                className="h-6 rounded-md border border-border bg-surface px-2 text-caption text-fg hover:bg-surface-sunken"
              >
                {ROTULO[variavel]}
              </button>
            ))}
          </div>

          {/* A previa e texto puro, como no site: o React escapa o que vier. */}
          <div className="mt-2 rounded-lg border border-border border-dashed bg-surface px-3 py-2 text-detail leading-normal">
            <p className="break-words text-fg">{renderWidgetText(value, sample)}</p>
            {USA_NOME.test(value) && (
              <p className="mt-1 break-words text-fg-muted">
                <span className="text-caption">sem nome: </span>
                {renderWidgetText(value, { ...sample, primeiroNome: null })}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
