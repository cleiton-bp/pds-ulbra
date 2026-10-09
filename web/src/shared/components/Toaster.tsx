import { createPortal } from 'react-dom'
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
 * **Com um dialogo aberto, o aviso mora dentro dele, embaixo a direita.** Fora, ele
 * caia em cima do X e do status do card aberto, o clique nele contava como clique
 * fora (e fechava o card com o que se escrevia), e o leitor de tela nao o lia — o
 * dialogo esconde o resto da pagina. Dentro, nada disso: e parte do dialogo.
 *
 * O erro e `alert`, e nao `status`: a mudanca que nao foi feita precisa ser dita
 * na hora, e nao depois do que o leitor estiver lendo.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)
  const host = useToastStore((state) => state.hosts.at(-1) ?? null)

  const regiao = (
    <div
      data-toasts
      className={cn(
        'pointer-events-none z-toast flex flex-col gap-2',
        host
          ? 'absolute right-4 bottom-4 w-[min(22rem,calc(100%-2rem))]'
          : 'fixed top-[4.5rem] right-5 w-[min(22rem,calc(100vw-2rem))]',
      )}
    >
      {toasts.map((item) => {
        const danger = item.tone === 'danger'

        return (
          <div
            key={item.id}
            role={danger ? 'alert' : 'status'}
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

  // O dialogo e `fixed` com `transform`: o `absolute` daqui de dentro se mede pela
  // caixa dele, e nao pela janela.
  return host ? createPortal(regiao, host) : regiao
}
