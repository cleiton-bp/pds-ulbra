import * as Dialog from '@radix-ui/react-dialog'
import { type ReactNode, useCallback, useLayoutEffect, useRef } from 'react'
import { useToastStore } from '@/shared/components/toastStore'
import { cn } from '@/shared/lib/cn'
import { focusAnyway } from '@/shared/lib/focus'

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
  /**
   * Para onde vai o foco quando quem abriu ja nao esta na pagina — o elemento foi
   * trocado enquanto o dialogo estava aberto. Sem isto, ou sem achar, o Radix decide.
   */
  fallbackFocus?: () => HTMLElement | null
  /**
   * O Esc, antes de fechar. Quem chama `preventDefault` segura o dialogo aberto — o
   * card aberto usa para o Esc sair primeiro da edicao em que o foco esta.
   */
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  /**
   * Falso, o clique fora nao fecha: o dialogo com texto escrito nao some por um
   * clique que errou a caixa. O Esc e o botao de cancelar continuam fechando.
   */
  closeOnOutsideClick?: boolean
  /** Botoes ao lado do X, no alto — os do card aberto: copiar o link, anterior e proximo. */
  headerActions?: ReactNode
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
  fallbackFocus,
  onEscapeKeyDown,
  closeOnOutsideClick = true,
  headerActions,
}: ModalProps) {
  const quemAbriu = useRef<HTMLElement | null>(null)
  const abertoEm = useRef(0)
  const fechar = useRef<HTMLButtonElement>(null)

  // Os avisos que nascem com o dialogo aberto vao para dentro dele — ver `Toaster`.
  const addHost = useToastStore((state) => state.addHost)
  const removeHost = useToastStore((state) => state.removeHost)
  const hospedar = useCallback(
    (caixa: HTMLDivElement | null) => {
      if (!caixa) return
      addHost(caixa)
      return () => removeHost(caixa)
    },
    [addHost, removeHost],
  )

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
          ref={hospedar}
          className={cn(
            '-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-dialog rounded-xl border border-border bg-surface-raised p-6',
            width,
            className,
          )}
          onCloseAutoFocus={(evento) => {
            // O Radix devolve o foco um instante depois de fechar. Se nesse instante o
            // foco ja foi para outro lugar — a pessoa ja estava no proximo card —, ele
            // fica la: devolver agora seria tirar o foco de quem ja se mexeu.
            const agora = document.activeElement
            if (agora && agora !== document.body) {
              evento.preventDefault()
              return
            }
            // Quem abriu pode ter saido da pagina (a linha de um card arquivado): ai vai
            // para a reserva de quem montou o dialogo, ou o Radix decide.
            const abriu = quemAbriu.current
            if (abriu?.isConnected) {
              evento.preventDefault()
              abriu.focus()
              return
            }
            const reserva = fallbackFocus?.() ?? null
            if (!reserva) return
            evento.preventDefault()
            focusAnyway(reserva)
          }}
          onOpenAutoFocus={(evento) => {
            // Com botoes no alto, o primeiro da ordem seria um deles: o foco continua
            // entrando no X, como nos outros dialogos grandes.
            if (!headerActions || !fechar.current) return
            evento.preventDefault()
            fechar.current.focus()
          }}
          onEscapeKeyDown={onEscapeKeyDown}
          onPointerDownOutside={(evento) => {
            if (!closeOnOutsideClick) evento.preventDefault()
            if (performance.now() - abertoEm.current < DUPLO_CLIQUE_MS) evento.preventDefault()
          }}
          onInteractOutside={(evento) => {
            // O aviso de outro dialogo (o de confirmar, por cima deste) nao e "fora":
            // fechar o aviso nunca fecha o card.
            const alvo = evento.target
            if (alvo instanceof Element && alvo.closest('[data-toasts]')) evento.preventDefault()
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

            {headerActions && (
              <div className="-mt-1 ml-auto flex flex-none items-center gap-1">{headerActions}</div>
            )}

            {closeButton && (
              <Dialog.Close
                ref={fechar}
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
