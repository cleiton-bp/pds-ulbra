import { useToastStore } from '@/shared/components/toastStore'
import { cn } from '@/shared/lib/cn'

/**
 * `role="status"` anuncia sem roubar o foco de onde a pessoa estava.
 *
 * **Vidro de verdade, e nao um cartao.** Da para ver o que passa atras do aviso, so um pouco
 * desfocado, com um veu bem fraco e o brilho fino na borda de cima (ver `vidro`, em
 * index.css), como as notificacoes dos sistemas de hoje. O que diz se e
 * erro ou confirmacao e o icone redondo (o visto verde, a exclamacao vermelha), e nao a
 * cor do texto nem da borda. Sem o desfoque no navegador, o fundo fica quase opaco, para o
 * texto continuar legivel.
 *
 * **Entra e sai devagar.** Desce de leve do alto ao aparecer, e sobe sumindo ao sair, com os
 * de baixo subindo junto, em vez de pular (ver `dismiss`, em `toastStore`). Quem pede menos
 * movimento ao sistema ve o aviso aparecer e sumir de uma vez.
 *
 * **Em cima, e nao embaixo.** O aviso confirma o que acabou de acontecer, e some
 * sozinho: no rodape ele nasce longe de onde a pessoa estava olhando e ha boa chance de
 * sumir sem ser lido. O `4.5rem` e o cabecalho de 56px das tres cascas mais um respiro —
 * colado no topo, o aviso cairia por cima do menu da conta, que e justamente o canto
 * onde ele aparece.
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
      className="pointer-events-none fixed top-[4.5rem] right-5 z-toast flex w-[min(22rem,calc(100vw-2rem))] flex-col"
    >
      {toasts.map((item) => {
        const danger = item.tone === 'danger'
        const saindo = item.saindo === true

        return (
          // A linha do aviso encolhe junto com ele ao sair: os de baixo sobem devagar, e o
          // vao entre eles (o `pb-2`) some junto, sem o pulo do fim.
          <div
            key={item.id}
            className={cn(
              'grid transition-[grid-template-rows,padding] duration-200 ease-in motion-reduce:transition-none',
              saindo ? 'grid-rows-[0fr] pb-0' : 'grid-rows-[1fr] pb-2',
            )}
          >
            <div className="min-h-0">
              <div
                role={saindo ? undefined : danger ? 'alert' : 'status'}
                aria-hidden={saindo || undefined}
                inert={saindo}
                onPointerEnter={() => pause(item.id)}
                onPointerLeave={() => resume(item.id)}
                onFocus={() => pause(item.id)}
                onBlur={() => resume(item.id)}
                className={cn(
                  'group pointer-events-auto flex items-center gap-3 rounded-2xl border py-3 pr-2.5 pl-3.5',
                  // O vidro mora numa utilidade so (`vidro`, em index.css): o veu, o desfoque
                  // leve, o brilho da borda e as sombras dos dois temas.
                  'vidro',
                  saindo ? 'animate-aviso-sai' : 'animate-aviso-entra',
                )}
              >
                <Icone danger={danger} />

                <p className="min-w-0 flex-1 text-body text-fg leading-snug">{item.message}</p>

                {/* O botao do aviso ("Desfazer", "Abrir"): roda e fecha o aviso. */}
                {item.action && (
                  <button
                    type="button"
                    onClick={() => {
                      dismiss(item.id)
                      item.action?.run()
                    }}
                    className="h-7 shrink-0 rounded-full bg-fg/10 px-3 font-medium text-detail text-fg transition-colors hover:bg-fg/15 pointer-coarse:h-9"
                  >
                    {item.action.label}
                  </button>
                )}

                {/* O X aparece com o ponteiro ou o foco no aviso, como nas notificacoes; no
                    toque e no erro, que nao some sozinho, ele fica sempre a vista. */}
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Fechar aviso"
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-fg-muted transition-[color,background-color,opacity] duration-150 hover:bg-fg/10 hover:text-fg focus-visible:opacity-100 pointer-coarse:size-9 pointer-coarse:opacity-100',
                    danger
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                  )}
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="size-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** O icone redondo do aviso: o visto verde na confirmacao, a exclamacao vermelha no erro. */
function Icone({ danger }: { danger: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full',
        danger ? 'bg-error-fg text-surface' : 'bg-active text-active-fg',
      )}
    >
      <svg
        viewBox="0 0 16 16"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {danger ? <path d="M8 4.2v4.6M8 11.6v.2" /> : <path d="m4.2 8.4 2.4 2.4 5.2-5.4" />}
      </svg>
    </span>
  )
}
