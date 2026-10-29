import { useState } from 'react'
import { SATISFACTION_SCALE } from '@/contracts'
import { cn } from '@/shared/lib/cn'

/** O que cada nota quer dizer: a palavra ao lado das estrelas, e o que o leitor de tela lê. */
const SIGNIFICADO: Record<number, string> = {
  1: 'Muito ruim',
  2: 'Ruim',
  3: 'Regular',
  4: 'Bom',
  5: 'Ótimo',
}

/**
 * A nota em estrelas, de 1 a 5, como a pessoa já conhece de outros lugares.
 *
 * **As estrelas acendem até a nota**, e não só a escolhida: a quarta acesa diz "4 de 5"
 * sem precisar contar. Passando o mouse, elas acendem até onde ele está, e a palavra ao
 * lado muda junto — a pessoa vê a nota antes de clicar. Tirando o mouse, volta a mostrar
 * a escolhida.
 *
 * **Radios de verdade por baixo**: as setas andam entre as notas, o leitor de tela anuncia
 * "Nota 4", e só uma fica marcada. A prévia do mouse só vale com mouse: no toque, ela
 * ficaria presa na última estrela tocada.
 */
export function StarRating({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null
  onChange: (valor: number) => void
  disabled?: boolean
}) {
  const [previa, setPrevia] = useState<number | null>(null)
  const acesas = previa ?? value ?? 0

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div className="flex items-center" onPointerLeave={() => setPrevia(null)}>
        {SATISFACTION_SCALE.map((valor) => (
          <label
            key={valor}
            onPointerEnter={(evento) => {
              if (evento.pointerType === 'mouse' && !disabled) setPrevia(valor)
            }}
            className={cn(
              'group flex h-11 w-11 items-center justify-center rounded-lg',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-[var(--focus)]',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            )}
          >
            <input
              type="radio"
              name="nota"
              value={valor}
              checked={value === valor}
              disabled={disabled}
              onChange={() => onChange(valor)}
              className="sr-only"
              aria-label={`Nota ${valor}`}
              aria-describedby={value === valor ? 'significado-da-nota' : undefined}
            />
            <Estrela
              acesa={valor <= acesas}
              className={cn(
                'transition-[transform,fill,stroke] duration-150 ease-out motion-reduce:transition-none',
                !disabled && 'group-hover:scale-110 group-active:scale-95',
              )}
            />
          </label>
        ))}
      </div>

      {/* A palavra ocupa sempre o mesmo espaço: trocando "Bom" por "Muito ruim", as
          estrelas não andam para o lado debaixo do mouse. */}
      <span
        id="significado-da-nota"
        aria-live="polite"
        className={cn(
          'min-w-24 whitespace-nowrap text-detail transition-colors duration-150',
          acesas ? 'text-fg' : 'text-fg-muted',
        )}
      >
        {acesas ? SIGNIFICADO[acesas] : 'De 1 a 5 estrelas'}
      </span>
    </div>
  )
}

/** As estrelas da nota já dada, pequenas e só para ler: o "4 de 5" vem escrito ao lado. */
export function StarRatingValue({ value }: { value: number }) {
  return (
    <span aria-hidden className="inline-flex items-center gap-0.5">
      {SATISFACTION_SCALE.map((valor) => (
        <Estrela key={valor} acesa={valor <= value} className="h-4 w-4" />
      ))}
    </span>
  )
}

function Estrela({ acesa, className }: { acesa: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn(
        'h-8 w-8',
        acesa ? 'fill-rating-fill stroke-rating-edge' : 'fill-transparent stroke-rating-empty',
        className,
      )}
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <path d="M12 2.8l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3L2.85 9.45l6.32-.92L12 2.8z" />
    </svg>
  )
}
