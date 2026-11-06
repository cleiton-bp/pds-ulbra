import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { useArrastarParaFechar } from '@/shared/hooks/useArrastarParaFechar'
import { cn } from '@/shared/lib/cn'

/**
 * A folha que sobe da borda de baixo, no celular: o lugar do que abria no meio da tela e
 * empurrava o conteudo para baixo (os filtros do Trabalho). Fica por cima, com o veu atras,
 * e o conteudo nao se mexe; fecha pelo X, pelo Esc, tocando no veu ou pelo botao do pe.
 *
 * Radix por baixo, como o `Modal`: foco preso, `Esc` e o resto da pagina inerte para leitor
 * de tela. O corpo rola sozinho e o pe fica preso, acima da barra de gestos do telefone.
 *
 * Puxar pelo alto fecha (ver `useArrastarParaFechar`). A altura segue o conteudo, ate 85%
 * da tela: o pe fica sempre na borda de baixo, no mesmo lugar, e so o alto da folha muda.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  footer,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  /** Uma linha menor embaixo do titulo, que o leitor de tela ouve como descricao. */
  subtitle?: ReactNode
  /** As acoes do pe, sempre a vista. */
  footer?: ReactNode
  children: ReactNode
}) {
  useArrastarParaFechar(() => onOpenChange(false), open)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-veil bg-overlay data-[state=closed]:animate-veil-out data-[state=open]:animate-veil-in" />
        <Dialog.Content
          // Com subtitulo, o Radix liga a descricao sozinho; sem, diz que nao ha.
          {...(subtitle ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed inset-x-0 bottom-0 z-dialog flex max-h-[85dvh] flex-col rounded-t-2xl border border-border border-b-0 bg-surface-raised shadow-lg data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in dark:bg-surface-strong',
            // O alto e de quem arrasta para fechar: sem gesto do navegador ali. O corpo, que
            // rola, continua com o gesto dele.
            'touch-none',
          )}
        >
          {/* A alca no alto diz que e uma folha, e nao uma pagina nova. */}
          <span aria-hidden className="mx-auto mt-2 h-1 w-9 flex-none rounded-full bg-border" />
          <div className="flex flex-none items-center justify-between gap-3 px-4 pt-2 pb-3">
            <div className="min-w-0">
              <Dialog.Title className="font-semibold text-dialog text-fg">{title}</Dialog.Title>
              {subtitle && (
                <Dialog.Description className="mt-0.5 text-caption text-fg-muted">
                  {subtitle}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Fechar"
              className="-mr-2 flex size-10 flex-none items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
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
                <path d="m2.5 2.5 7 7m0-7-7 7" />
              </svg>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {children}
          </div>
          {footer && (
            <div className="flex flex-none items-center justify-between gap-3 border-border border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
