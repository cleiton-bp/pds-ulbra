import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * O editor de duas colunas das telas que mudam o que se ve — O botão, Formulário,
 * Anexos, Tipos de relato: **a esquerda, os controles; a direita, a previa presa ao
 * rolar**, a partir de `lg`. A previa no meio da coluna fazia quem mexia la embaixo rolar
 * para cima e para baixo a cada mudanca. Abaixo de `lg`, uma coluna, com a previa no
 * topo.
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
    <div className={cn('grid gap-6 lg:grid-cols-2 lg:items-start', className)}>
      <div className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-1">{children}</div>
      <div className="order-first lg:sticky lg:-top-5 lg:order-none lg:col-start-2 lg:row-start-1">
        {preview}
      </div>
    </div>
  )
}
