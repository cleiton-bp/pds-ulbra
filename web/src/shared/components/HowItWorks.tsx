import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * "Como funciona": a explicacao longa, recolhida — nas abas de Domínios, nos grupos do
 * Ciclo, em Tipos de relato e no Andamento público. Mora em `shared` porque as telas a usam.
 *
 * **Uma linha aberta, o resto fechado.** A tela tinha umas dezenove linhas de ajuda antes
 * da primeira lista: quem ja sabia o que fazer rolava ate o campo, e quem nao sabia lia
 * tudo de uma vez. Agora cada aba diz em uma linha o que a lista e, e o resto espera aqui.
 *
 * **Um `<details>` de verdade**, e nao um estado do React: o texto continua no documento
 * — o leitor de tela e o "procurar na pagina" o acham — e nada se perde ao trocar de aba.
 */
export function HowItWorks({
  children,
  className = 'mb-4',
  bodyClassName,
  label = 'Como funciona',
}: {
  children: ReactNode
  /** O respiro em volta. No fim de um grupo (Ciclo) nao ha nada embaixo para afastar. */
  className?: string
  /** A largura do texto, quando ele corre a pagina inteira (Andamento público). */
  bodyClassName?: string
  /**
   * O que a linha fechada diz. "Como funciona" quase sempre — e outra coisa quando ha
   * dois no mesmo grupo, como o guia do cracha em Quem relata: dois "Como funciona"
   * seguidos nao dizem qual e qual.
   */
  label?: string
}) {
  return (
    <details className={cn('details-smooth group', className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-caption text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 12 12"
          className="size-2.5 flex-none transition-transform duration-300 ease-out group-open:rotate-90 motion-reduce:transition-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
        </svg>
        {label}
      </summary>
      <div
        className={cn(
          'mt-2 flex flex-col gap-2 border-border border-l-2 pl-3 text-caption text-fg-muted leading-relaxed',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </details>
  )
}
