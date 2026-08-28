import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * Radix da o que costuma faltar em modal escrito a mao: foco preso, `Esc`, foco
 * devolvido a quem abriu e o resto da pagina inerte para leitor de tela.
 */
interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Opcional: dialogo de um campo so nao precisa de paragrafo antes dele. */
  description?: string
  children?: ReactNode
  footer: ReactNode
  width?: string
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'w-[min(26.25rem,calc(100vw-2rem))]',
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-veil bg-overlay" />
        {/* Sem `Dialog.Description` o Radix desta versao ja omite o
            `aria-describedby` sozinho: ele conta quantas descricoes foram
            montadas. Nao precisa da gambiarra de passar `undefined` a mao. */}
        <Dialog.Content
          className={`-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-dialog rounded-xl border border-border bg-surface-raised p-6 ${width}`}
        >
          <Dialog.Title
            className={cn('font-semibold text-dialog text-fg', description ? 'mb-1.5' : 'mb-5')}
          >
            {title}
          </Dialog.Title>

          {description && (
            <Dialog.Description className="mb-5 text-detail text-fg-muted leading-relaxed">
              {description}
            </Dialog.Description>
          )}

          {children}

          <div className="mt-6 flex justify-end gap-2">{footer}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
