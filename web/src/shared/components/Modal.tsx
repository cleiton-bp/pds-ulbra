import * as Dialog from '@radix-ui/react-dialog'
import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * Radix da o que costuma faltar em modal escrito a mao: foco preso, `Esc` e o resto da
 * pagina inerte para leitor de tela.
 *
 * **O foco volta para quem abriu**, e isso e feito aqui: o Radix so o devolve ao
 * gatilho dele (`Dialog.Trigger`), que este componente nao usa — quem abre e um botao,
 * um link da lista, uma rota. Sem isto, fechar mandava o foco para o comeco da pagina,
 * e quem usa o teclado perdia o lugar na tabela.
 */

/** O segundo clique de um duplo clique, se cair fora da caixa, nao fecha o que o primeiro abriu. */
const DUPLO_CLIQUE_MS = 500

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** O nome do dialogo. Pode levar desenho junto (o tipo do card), alem do texto. */
  title: ReactNode
  /** Opcional: dialogo de um campo so nao precisa de paragrafo antes dele. */
  description?: string
  children?: ReactNode
  /** Os botoes do pe. Sem eles, o dialogo nao tem pe: fecha pelo X (`closeButton`) e, sempre, pelo Esc. */
  footer?: ReactNode
  width?: string
  /** Um X no canto, ao lado do titulo: o dialogo grande, que nao tem pe. */
  closeButton?: boolean
  /** Classes a mais da caixa — a altura maxima e a coluna do dialogo grande. */
  className?: string
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'w-[min(26.25rem,calc(100vw-2rem))]',
  closeButton = false,
  className,
}: ModalProps) {
  const quemAbriu = useRef<HTMLElement | null>(null)
  const abertoEm = useRef(0)

  // Antes de o Radix mover o foco para dentro: o efeito dele roda depois deste.
  useLayoutEffect(() => {
    if (!open) return
    const ativo = document.activeElement
    quemAbriu.current = ativo instanceof HTMLElement && ativo !== document.body ? ativo : null
    abertoEm.current = performance.now()
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-veil bg-overlay" />
        {/* Sem `Dialog.Description` o Radix desta versao ja omite o
            `aria-describedby` sozinho: ele conta quantas descricoes foram
            montadas. Nao precisa da gambiarra de passar `undefined` a mao. */}
        <Dialog.Content
          className={cn(
            '-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-dialog rounded-xl border border-border bg-surface-raised p-6',
            width,
            className,
          )}
          onCloseAutoFocus={(evento) => {
            // Quem abriu pode ter saido da pagina (a linha de um card arquivado): ai o
            // Radix decide.
            const alvo = quemAbriu.current
            if (!alvo?.isConnected) return
            evento.preventDefault()
            alvo.focus()
          }}
          onPointerDownOutside={(evento) => {
            if (performance.now() - abertoEm.current < DUPLO_CLIQUE_MS) evento.preventDefault()
          }}
        >
          <div
            className={cn(
              'flex items-start justify-between gap-3',
              description ? 'mb-1.5' : 'mb-5',
            )}
          >
            <Dialog.Title className="min-w-0 font-semibold text-dialog text-fg">
              {title}
            </Dialog.Title>

            {closeButton && (
              <Dialog.Close
                aria-label="Fechar"
                className="-mt-1 -mr-2 flex size-8 flex-none items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
              >
                <svg
                  viewBox="0 0 12 12"
                  className="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M3 3l6 6M9 3 3 9" />
                </svg>
              </Dialog.Close>
            )}
          </div>

          {description && (
            <Dialog.Description className="mb-5 text-detail text-fg-muted leading-relaxed">
              {description}
            </Dialog.Description>
          )}

          {children}

          {footer !== undefined && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
