import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * O `twMerge` so conhece a escala **padrao** do Tailwind, e aqui nao existe
 * escala padrao: o `index.css` apaga a dele (`--text-*: initial`) e publica a
 * deste produto. Sem as listas abaixo ele nao distingue `text-body` (tamanho) de
 * `text-accent-fg` (cor), joga as duas no mesmo grupo e **descarta a primeira** —
 * que no `Button` e sempre a cor. O rotulo do botao primario saia invisivel.
 *
 * As listas sao copia do `index.css` porque isto e TypeScript e a fonte e CSS. O
 * `designSystem.test.ts` compara as duas e reprova se divergirem.
 */
const FONT_SIZE_NAMES = [
  'caption',
  'detail',
  'body',
  'lead',
  'dialog',
  'brand',
  'notice',
  'screen',
  'hero',
  'hero-wide',
  'display',
]

const COLOR_NAMES = [
  'surface',
  'surface-raised',
  'surface-sunken',
  'surface-strong',
  'border',
  'fg',
  'fg-muted',
  'fg-disabled',
  'fg-placeholder',
  'accent',
  'accent-fg',
  'accent-hover',
  'nav-active',
  'active',
  'active-fg',
  'warn-surface',
  'warn-surface-hover',
  'warn-border',
  'warn-fg',
  'error-border',
  'error-fg',
  'muted-dot',
  'overlay',
]

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: FONT_SIZE_NAMES,
      color: COLOR_NAMES,
    },
  },
})

/** Publicadas para o teste que as compara com o `index.css`. */
export const fontSizeNames: readonly string[] = FONT_SIZE_NAMES
export const colorNames: readonly string[] = COLOR_NAMES

/**
 * Junta classes e resolve conflito entre utilitarios do Tailwind.
 *
 * Sem isto, `cn('px-4', condicao && 'px-2')` deixaria as duas no elemento e quem
 * vence seria a ordem no CSS gerado, nao a intencao de quem escreveu.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
