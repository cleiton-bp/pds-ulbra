import { useToastStore } from '@/shared/components/toastStore'
import { cn } from '@/shared/lib/cn'

/**
 * `role="status"` anuncia sem roubar o foco de onde a pessoa estava.
 *
 * No tema escuro a sombra e preta sobre fundo quase preto e nao separa nada,
 * entao a elevacao vira superficie mais clara. A **borda** fica de fora disso de
 * proposito: ela diz se o aviso e erro ou confirmacao.
 *
 * **Em cima, e nao embaixo.** O aviso confirma o que acabou de acontecer, e some
 * sozinho em quatro segundos: no rodape ele nasce longe de onde a pessoa estava
 * olhando e ha boa chance de sumir sem ser lido. O `4.5rem` e o cabecalho de 56px
 * das tres cascas mais um respiro — colado no topo, o aviso cairia por cima do
 * menu da conta, que e justamente o canto onde ele aparece.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div className="pointer-events-none fixed top-[4.5rem] right-5 z-toast flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((item) => {
        const danger = item.tone === 'danger'

        return (
          <div
            key={item.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface-raised p-3.5',
              'shadow-lg dark:bg-surface-strong dark:shadow-none',
              danger ? 'border-error-border' : 'border-border',
            )}
          >
            <span
              className={cn(
                'mt-1.5 size-2 shrink-0 rounded-full',
                danger ? 'bg-error-fg' : 'bg-active',
              )}
              aria-hidden
            />

            <p
              className={cn(
                'flex-1 text-detail leading-relaxed',
                danger ? 'text-error-fg' : 'text-fg',
              )}
            >
              {item.message}
            </p>

            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="shrink-0 text-fg-muted text-caption transition-colors hover:text-fg"
              aria-label="Fechar aviso"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
