import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

/**
 * Vem do Radix, e nao de um `hover` proprio, para aparecer tambem no foco do
 * teclado e ser lida por leitor de tela.
 */
export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <RadixTooltip.Root delayDuration={150}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side="right"
          sideOffset={8}
          className="z-tip w-54 rounded-lg border border-border bg-surface px-2.5 py-2 text-detail text-fg-muted leading-snug"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}

/** Um provedor so, no topo, para todas as dicas dividirem o atraso. */
export const TooltipProvider = RadixTooltip.Provider
