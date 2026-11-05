import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { guideTarget } from '@/shared/tour/guideStore'

/**
 * O editor de duas colunas das telas que mudam o que se ve — O botão, Formulário,
 * Anexos, Tipos de relato: **a esquerda, os controles; a direita, a previa presa ao
 * rolar**, a partir de `lg`. A previa no meio da coluna fazia quem mexia la embaixo rolar
 * para cima e para baixo a cada mudanca. Abaixo de `lg`, uma coluna, com a previa no
 * topo.
 *
 * **60% para os controles, 40% para a previa.** Metade e metade apertava o que se
 * configura (o passo a passo com codigo, na Privacidade, ficava estreito demais), e a
 * previa cabe inteira em menos: o formulario dela tem a largura de um formulario.
 *
 * **Os controles vem antes da previa no codigo**, e a previa so e desenhada no topo
 * (`order-first`): quem anda pelo Tab chega aos controles primeiro, e nao atravessa o
 * quadro da previa para comecar.
 *
 * **`-top-5`, e nao `top-6`**: o navegador mede o "grudar" a partir de dentro do
 * respiro de cima da area que rola (40 px), e com `top-6` a previa grudava a 64 px do
 * topo, com um vao branco em cima que so sumia no fim da tela. Assim ela gruda a uns
 * 20 px.
 *
 * Como usar: os grupos (`SettingsGroup`) vao em `children`, e a `PreviewSection` vai em
 * `preview` — direto, sem embrulho, porque e o pai dela que gruda e muda de ordem.
 */
export function EditorWithPreview({
  preview,
  children,
  className,
}: {
  /** A previa, na coluna da direita, presa ao rolar. */
  preview: ReactNode
  /** Os controles, na coluna da esquerda, um embaixo do outro. */
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start',
        className,
      )}
    >
      <div
        className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-1"
        {...guideTarget('opcoes')}
      >
        {children}
      </div>
      <div
        className="order-first lg:sticky lg:-top-5 lg:order-none lg:col-start-2 lg:row-start-1"
        {...guideTarget('previa')}
      >
        {preview}
      </div>
    </div>
  )
}
