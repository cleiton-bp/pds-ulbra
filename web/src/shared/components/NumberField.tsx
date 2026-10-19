import type { FocusEvent } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * O campo numerico do painel: o numero no meio, e os botoes de menos e mais sempre a
 * vista, um de cada lado.
 *
 * **Sem as setinhas do navegador.** O `number` nativo desenha um contador minusculo
 * que so aparece com o mouse em cima, dentro do campo, e que e dificil de acertar; a
 * tela parecia mudar sob o ponteiro. Aqui as setinhas ficam escondidas
 * (`input-number-plain`) e os botoes de fora fazem o papel delas, do tamanho de um
 * clique. O campo continua sendo um `number` de verdade: o teclado do telefone abre
 * numerico, as setas para cima e para baixo andam o valor, e o leitor de tela o ve como
 * um `spinbutton` com minimo e maximo.
 *
 * **O valor e texto, e quem usa e que le o numero.** Cada tela tem a sua regra para o
 * campo vazio, o decimal e o fora da faixa; o campo so entrega o que foi digitado. Os
 * botoes andam a partir do numero que estiver la (ou do minimo, se nao houver numero),
 * um passo por vez, sem passar do minimo nem do maximo — e desligam na borda.
 */
export function NumberField({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  invalid = false,
  size = 'md',
  width,
  inputMode,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  onBlur,
  className,
}: {
  id?: string
  /** O que esta no campo, como texto ou numero. */
  value: string | number
  /** O que ficou no campo depois de digitar ou de apertar um botao, como texto. */
  onChange: (value: string) => void
  min?: number
  max?: number
  /**
   * Quanto cada botao anda. `'any'` deixa o navegador aceitar qualquer decimal, e os
   * botoes andam de um em um.
   */
  step?: number | 'any'
  disabled?: boolean
  invalid?: boolean
  /** `md` acompanha os campos de texto (36px); `sm`, os controles de barra (32px). */
  size?: 'md' | 'sm'
  /** A largura so do numero, por classe (`w-14`). Sem ela, cabe tres digitos. */
  width?: string
  inputMode?: 'numeric' | 'decimal'
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
  /** Classes da moldura inteira, para ancora (`scroll-mt-6`) e respiro. */
  className?: string
}) {
  const passo = typeof step === 'number' ? step : 1
  const numero = typeof value === 'number' ? value : Number.parseFloat(value)
  const temNumero = Number.isFinite(numero)
  const noMinimo = temNumero && min !== undefined && numero <= min
  const noMaximo = temNumero && max !== undefined && numero >= max

  function andar(direcao: 1 | -1) {
    const base = temNumero ? numero : (min ?? 0)
    let proximo = base + direcao * passo
    if (min !== undefined) proximo = Math.max(min, proximo)
    if (max !== undefined) proximo = Math.min(max, proximo)
    // Sem a sujeira do ponto flutuante: 0,1 + 0,2 e 0,3, e nao 0,30000000000000004.
    const casas = (String(passo).split('.')[1] ?? '').length
    onChange(proximo.toFixed(casas))
  }

  return (
    <span
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-lg border bg-surface-raised transition-colors duration-150',
        size === 'md' ? 'h-9' : 'h-8',
        invalid ? 'border-error-border' : 'border-border',
        disabled && 'opacity-60',
        className,
      )}
    >
      <Botao
        sentido="menos"
        disabled={disabled || noMinimo}
        onClick={() => andar(-1)}
        size={size}
      />
      <input
        id={id}
        type="number"
        inputMode={inputMode}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={cn(
          'input-number-plain min-w-0 border-border border-x bg-transparent text-center text-fg tabular-nums disabled:cursor-not-allowed',
          size === 'md' ? 'px-1 text-body' : 'px-0.5 text-detail',
          width ?? 'w-12',
        )}
      />
      <Botao sentido="mais" disabled={disabled || noMaximo} onClick={() => andar(1)} size={size} />
    </span>
  )
}

/**
 * O botao de menos ou de mais. Fora da ordem do Tab e invisivel ao leitor de tela: o
 * campo ja anda pelas setas, e o leitor ja o ve como spinbutton — dois botoes a mais
 * por campo seriam duas paradas que nao acrescentam nada.
 */
function Botao({
  sentido,
  disabled,
  onClick,
  size,
}: {
  sentido: 'menos' | 'mais'
  disabled: boolean
  onClick: () => void
  size: 'md' | 'sm'
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex flex-none items-center justify-center text-fg-muted transition-all duration-150 ease-out enabled:hover:bg-surface-sunken enabled:hover:text-fg enabled:active:scale-90 disabled:text-fg-disabled motion-reduce:transition-none',
        size === 'md' ? 'w-8' : 'w-7',
      )}
    >
      <svg
        viewBox="0 0 12 12"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M2.5 6h7" />
        {sentido === 'mais' && <path d="M6 2.5v7" />}
      </svg>
    </button>
  )
}
