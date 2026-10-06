import type { ReactNode } from 'react'
import { CARD_COLORS, type CardColor } from '@/contracts'
import { cn } from '@/shared/lib/cn'

/**
 * As classes de cada cor da paleta de dado — fundo, borda e texto —, escritas por
 * inteiro: o Tailwind so gera a classe que ele acha no codigo, e uma classe
 * montada por concatenacao nao seria achada. A paleta e os pares de contraste
 * estao em `tokens.css`.
 */
export const CARD_COLOR_CLASSES: Record<CardColor, string> = {
  Gray: 'border-chip-gray-border bg-chip-gray-surface text-chip-gray-fg',
  Blue: 'border-chip-blue-border bg-chip-blue-surface text-chip-blue-fg',
  Green: 'border-chip-green-border bg-chip-green-surface text-chip-green-fg',
  Yellow: 'border-chip-yellow-border bg-chip-yellow-surface text-chip-yellow-fg',
  Orange: 'border-chip-orange-border bg-chip-orange-surface text-chip-orange-fg',
  Red: 'border-chip-red-border bg-chip-red-surface text-chip-red-fg',
  Purple: 'border-chip-purple-border bg-chip-purple-surface text-chip-purple-fg',
  Pink: 'border-chip-pink-border bg-chip-pink-surface text-chip-pink-fg',
}

/**
 * O tom de cada cor para um desenho que vai ao lado do nome (o icone da prioridade):
 * o nome fica na cor do texto, e a cor vai so no desenho, num degrau proprio.
 */
export const CARD_COLOR_GLYPH: Record<CardColor, string> = {
  Gray: 'text-chip-gray-glyph',
  Blue: 'text-chip-blue-glyph',
  Green: 'text-chip-green-glyph',
  Yellow: 'text-chip-yellow-glyph',
  Orange: 'text-chip-orange-glyph',
  Red: 'text-chip-red-glyph',
  Purple: 'text-chip-purple-glyph',
  Pink: 'text-chip-pink-glyph',
}

/** O nome de cada cor, para o seletor e para quem nao ve a cor. */
export const CARD_COLOR_NAMES: Record<CardColor, string> = {
  Gray: 'Cinza',
  Blue: 'Azul',
  Green: 'Verde',
  Yellow: 'Amarelo',
  Orange: 'Laranja',
  Red: 'Vermelho',
  Purple: 'Roxo',
  Pink: 'Rosa',
}

/**
 * Uma etiqueta ou uma prioridade: a cor que o time escolheu, **sempre com o nome
 * escrito** — cor nunca sozinha.
 */
export function CardChip({
  color,
  children,
  className,
}: {
  color: CardColor
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-px text-caption',
        CARD_COLOR_CLASSES[color],
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  )
}

/**
 * Escolher uma cor da paleta: um botao por cor. A escolhida leva o visto — a borda
 * sozinha nao diz qual e para quem nao distingue as cores — e o nome vai para o
 * leitor de tela.
 */
export function CardColorPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: CardColor
  onChange: (color: CardColor) => void
  disabled?: boolean
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1.5 text-detail text-fg-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {CARD_COLORS.map((cor) => (
          <button
            key={cor}
            type="button"
            aria-pressed={value === cor}
            aria-label={CARD_COLOR_NAMES[cor]}
            title={CARD_COLOR_NAMES[cor]}
            onClick={() => onChange(cor)}
            className={cn(
              'flex size-7 items-center justify-center rounded-full border disabled:opacity-60',
              CARD_COLOR_CLASSES[cor],
            )}
          >
            {value === cor && (
              <svg
                viewBox="0 0 12 12"
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M2.5 6.3 4.8 8.6 9.5 3.9" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
