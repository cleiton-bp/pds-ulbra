import { Modal } from '@/shared/components/Modal'
import { cn } from '@/shared/lib/cn'

/** Um atalho: as teclas (uma ou mais, como "J" e "K") e o que ele faz. */
export interface Shortcut {
  teclas: readonly string[]
  oQue: string
}

/**
 * A lista dos atalhos do teclado de uma tela, num dialogo.
 *
 * **Dialogo, e nao bloco na propria tela.** A Moderacao abria a lista no meio da barra
 * de filtros, e os controles descian meio palmo para dar lugar a ela — quem apertava o
 * "?" para ver um atalho via a tela inteira se mexer. O dialogo fica por cima, e a
 * tela nao sai do lugar. Mora em `shared` porque o Trabalho e a Moderacao mostram o
 * mesmo desenho, cada um com os seus atalhos.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
  atalhos,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  atalhos: readonly Shortcut[]
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Atalhos"
      closeButton
      width="w-[min(30rem,calc(100vw-2rem))]"
    >
      <dl className="flex flex-col gap-2.5 text-detail">
        {atalhos.map((atalho) => (
          <div
            key={atalho.oQue}
            className="grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-3"
          >
            <dt className="flex flex-wrap items-center gap-1">
              {atalho.teclas.map((tecla) => (
                <kbd
                  key={tecla}
                  className="rounded border border-border bg-surface px-1.5 font-mono text-caption text-fg"
                >
                  {tecla}
                </kbd>
              ))}
            </dt>
            <dd className="text-fg-muted">{atalho.oQue}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}

/**
 * O botao que abre a lista: um "?" no desenho dos controles de barra. Sempre com
 * `aria-keyshortcuts`, porque a tecla "?" abre o mesmo dialogo.
 */
export function ShortcutsButton({
  onClick,
  size = 'md',
}: {
  onClick: () => void
  /** `md` acompanha o botao de acao do titulo (36px); `sm`, os controles de barra (32px). */
  size?: 'md' | 'sm'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Atalhos do teclado"
      aria-keyshortcuts="?"
      title="Atalhos do teclado (?)"
      className={cn(
        'hidden flex-none items-center justify-center rounded-lg border border-border font-mono text-detail text-fg-muted transition-all duration-150 ease-out hover:bg-surface-sunken hover:text-fg active:scale-[0.97] motion-reduce:transition-none sm:flex',
        size === 'md' ? 'size-9' : 'size-8',
      )}
    >
      ?
    </button>
  )
}
