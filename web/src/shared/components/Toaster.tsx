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
 *
 * **Sempre no mesmo lugar, com dialogo aberto ou nao.** O aviso dentro do dialogo
 * aparecia num canto diferente a cada dialogo, e quem estava acostumado a le-lo no alto
 * da pagina nao o achava. Os dois cuidados de quando ele morava dentro continuam:
 * - **O clique no aviso nao fecha o dialogo**: o `Modal` nao conta clique em
 *   `[data-toasts]` como clique fora.
 * - **O leitor de tela continua lendo o aviso**: o dialogo esconde o resto da pagina
 *   (`aria-hidden`), mas a biblioteca que faz isso nao esconde o que tem `aria-live`. Por
 *   isso a regiao leva `aria-live="off"`: o atributo a mantem visivel ao leitor de tela,
 *   e o "off" deixa cada aviso falar pelo proprio papel (`status` ou `alert`), sem o
 *   anuncio dobrado de uma regiao dentro da outra.
 *
 * O erro e `alert`, e nao `status`: a mudanca que nao foi feita precisa ser dita
 * na hora, e nao depois do que o leitor estiver lendo.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)
  const pause = useToastStore((state) => state.pause)
  const resume = useToastStore((state) => state.resume)
  return (
    <div
      data-toasts
      aria-live="off"
      className="pointer-events-none fixed top-[4.5rem] right-5 z-toast flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((item) => {
        const danger = item.tone === 'danger'

        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: so para a contagem do aviso enquanto o ponteiro ou o foco estao nele, e nao e uma acao
          <div
            key={item.id}
            role={danger ? 'alert' : 'status'}
            onPointerEnter={() => pause(item.id)}
            onPointerLeave={() => resume(item.id)}
            onFocus={() => pause(item.id)}
            onBlur={() => resume(item.id)}
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

            {/* O botao do aviso ("Desfazer", "Abrir"): roda e fecha o aviso. */}
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  dismiss(item.id)
                  item.action?.run()
                }}
                className="shrink-0 font-medium text-detail text-fg underline underline-offset-2 hover:text-fg-muted"
              >
                {item.action.label}
              </button>
            )}

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
