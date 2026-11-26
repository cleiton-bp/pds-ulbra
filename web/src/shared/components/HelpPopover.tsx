import * as Popover from '@radix-ui/react-popover'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * O "?" ao lado de um campo: abre um balao com a explicacao e, quando ajuda, o caminho
 * para resolver ali mesmo (a coluna da reabertura leva a criar a coluna em Colunas).
 *
 * **Balao, e nao "Como funciona".** O "Como funciona" fica no fim do grupo e explica o
 * grupo inteiro; o "?" responde a duvida de um campo so, junto dele, na hora em que a
 * pessoa olha para ele sem saber o que escolher.
 *
 * Vem do Popover do Radix, como o calendario do `DateField`: abre no clique e no teclado,
 * fecha com Esc e com clique fora, e o leitor de tela anuncia o titulo. A moldura e a
 * animacao sao as do calendario: sobreposicao do produto tem uma forma so.
 */
export function HelpPopover({
  label,
  title,
  children,
}: {
  /** O nome do botao para quem nao ve o "?": "Ajuda sobre a coluna da reabertura". */
  label: string
  /** A primeira linha do balao, em destaque. */
  title: string
  children: ReactNode
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="alvo-de-toque-icone relative inline-flex size-4.5 flex-none items-center justify-center rounded-full border border-border text-[0.6875rem] text-fg-muted leading-none transition-colors hover:border-fg-muted hover:text-fg data-[state=open]:border-accent data-[state=open]:text-fg"
      >
        ?
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-label={title}
          className={cn(
            'z-dialog w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-raised p-4',
            'origin-(--radix-popover-content-transform-origin) data-[state=closed]:animate-menu-out data-[state=open]:animate-menu-in',
            'shadow-lg dark:bg-surface-strong dark:shadow-none',
          )}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="font-medium text-detail text-fg leading-snug">{title}</p>
            <Popover.Close
              aria-label="Fechar"
              className="alvo-de-toque-icone relative -mt-0.5 -mr-1 inline-flex size-6 flex-none items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
            >
              <svg
                viewBox="0 0 12 12"
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="m3 3 6 6M9 3l-6 6" />
              </svg>
            </Popover.Close>
          </div>
          <div className="flex flex-col gap-2 text-caption text-fg-muted leading-relaxed">
            {children}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
