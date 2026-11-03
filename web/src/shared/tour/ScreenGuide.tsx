import * as Dialog from '@radix-ui/react-dialog'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/shared/components/Button'
import { cn } from '@/shared/lib/cn'
import type { GuideStep } from '@/shared/tour/guideStore'

type Caixa = { left: number; top: number; width: number; height: number }

/** Quanto esperar o alvo aparecer antes de pular o passo. */
const ESPERA_MS = 700
/** O guia esmaece ao sair: o mesmo tempo da transicao de opacidade. */
const SAIDA_MS = 160
/** A folga do destaque em volta do alvo. */
const FOLGA = 6
/** A distancia entre o alvo e o cartao, e do cartao ate a borda da tela. */
const VAO = 14
const MARGEM = 12
const LARGURA = 320

type Lado = 'bottom' | 'top' | 'right' | 'left'

/**
 * Onde o cartao fica: encostado no alvo, do lado em que cabe; embaixo ou em cima das
 * partes baixas, ao lado das altas. Sem alvo, no meio da tela.
 */
function lugarDoCartao(
  caixa: Caixa | null,
  cartao: { width: number; height: number },
): { left: number; top: number } {
  const largura = window.innerWidth
  const altura = window.innerHeight
  const cabeX = (x: number) => Math.min(largura - cartao.width - MARGEM, Math.max(MARGEM, x))
  const cabeY = (y: number) => Math.min(altura - cartao.height - MARGEM, Math.max(MARGEM, y))
  if (!caixa)
    return { left: cabeX((largura - cartao.width) / 2), top: cabeY((altura - cartao.height) / 2) }

  const meioX = cabeX(caixa.left + caixa.width / 2 - cartao.width / 2)
  const meioY = cabeY(caixa.top + caixa.height / 2 - cartao.height / 2)
  const lados: Record<Lado, { left: number; top: number; cabe: boolean }> = {
    bottom: {
      left: meioX,
      top: caixa.top + caixa.height + VAO,
      cabe: caixa.top + caixa.height + VAO + cartao.height <= altura - MARGEM,
    },
    top: {
      left: meioX,
      top: caixa.top - VAO - cartao.height,
      cabe: caixa.top - VAO - cartao.height >= MARGEM,
    },
    right: {
      left: caixa.left + caixa.width + VAO,
      top: meioY,
      cabe: caixa.left + caixa.width + VAO + cartao.width <= largura - MARGEM,
    },
    left: {
      left: caixa.left - VAO - cartao.width,
      top: meioY,
      cabe: caixa.left - VAO - cartao.width >= MARGEM,
    },
  }
  const ordem: Lado[] =
    caixa.height > altura / 2
      ? ['right', 'left', 'bottom', 'top']
      : ['bottom', 'top', 'right', 'left']
  const lado = ordem.find((nome) => lados[nome].cabe)
  if (lado) return { left: lados[lado].left, top: lados[lado].top }
  return { left: meioX, top: cabeY(caixa.top + caixa.height - cartao.height - 2 * VAO) }
}

/** O primeiro alvo com esse nome que esta de fato na tela (o do celular ou o da tela larga). */
export function acharAlvo(nome: string): HTMLElement | null {
  for (const elemento of document.querySelectorAll<HTMLElement>(`[data-guia="${nome}"]`)) {
    const caixa = elemento.getBoundingClientRect()
    if (caixa.width > 0 && caixa.height > 0) return elemento
  }
  return null
}

/**
 * O guia da tela: tudo escurece, a parte da vez fica acesa, e um cartao conta para que
 * ela serve. Proximo e Voltar andam (as setas tambem), Esc ou Sair fecham.
 *
 * **O guia mostra, e nao mexe.** Enquanto ele esta aberto, o resto da tela nao responde:
 * nem clique nem atalho. Quem mexe e a pessoa, depois. O mesmo motor do tour do editor
 * de modelagem, com as cores e os botoes do painel.
 */
export function ScreenGuide({ passos, aoFechar }: { passos: GuideStep[]; aoFechar: () => void }) {
  const [indice, setIndice] = useState(0)
  // O que esta na tela: o passo e a caixa do alvo. So muda quando o alvo do passo novo
  // foi achado, entao o passo pulado nao chega a piscar.
  const [visto, setVisto] = useState<{ indice: number; caixa: Caixa | null } | null>(null)
  const [saindo, setSaindo] = useState(false)
  const [alturaDoCartao, setAlturaDoCartao] = useState(190)
  const [, setTela] = useState(0)
  const sentido = useRef<1 | -1>(1)
  const cartao = useRef<HTMLDivElement>(null)
  const proximo = useRef<HTMLButtonElement>(null)

  const fechar = useCallback(() => {
    if (saindo) return
    setSaindo(true)
    window.setTimeout(aoFechar, SAIDA_MS)
  }, [saindo, aoFechar])

  const andar = useCallback(
    (delta: 1 | -1) => {
      const seguinte = indice + delta
      if (seguinte < 0) return
      if (seguinte >= passos.length) {
        fechar()
        return
      }
      sentido.current = delta
      setIndice(seguinte)
    },
    [indice, passos.length, fechar],
  )

  const fecharRef = useRef(fechar)
  fecharRef.current = fechar
  const andarRef = useRef(andar)
  andarRef.current = andar

  // Acha o alvo e o acompanha a cada quadro (a janela mudando de tamanho, a lista que
  // rola ate ele). Alvo que nao aparece a tempo leva ao passo seguinte, no mesmo sentido.
  useEffect(() => {
    const nome = passos[indice]?.alvo
    if (!nome) {
      setVisto({ indice, caixa: null })
      return
    }
    const comeco = performance.now()
    let quadro = 0
    let achado = ''
    let rolou = false
    const procurar = () => {
      const elemento = acharAlvo(nome)
      if (elemento) {
        // Fora da tela (no celular, a lista embaixo): traz ate o meio, uma vez.
        if (!rolou) {
          rolou = true
          const r = elemento.getBoundingClientRect()
          if (r.top < 64 || r.bottom > window.innerHeight - 24) {
            const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            elemento.scrollIntoView({ block: 'center', behavior: suave ? 'smooth' : 'auto' })
          }
        }
        const r = elemento.getBoundingClientRect()
        const caixa = {
          left: r.left - FOLGA,
          top: r.top - FOLGA,
          width: r.width + 2 * FOLGA,
          height: r.height + 2 * FOLGA,
        }
        const chave = [caixa.left, caixa.top, caixa.width, caixa.height].map(Math.round).join()
        if (chave !== achado) {
          achado = chave
          setVisto({ indice, caixa })
        }
      } else if (!achado && performance.now() - comeco > ESPERA_MS) {
        const seguinte = indice + sentido.current
        if (seguinte >= passos.length) fecharRef.current()
        else if (seguinte < 0) {
          sentido.current = 1
          setIndice(indice + 1)
        } else setIndice(seguinte)
        return
      }
      quadro = requestAnimationFrame(procurar)
    }
    quadro = requestAnimationFrame(procurar)
    return () => cancelAnimationFrame(quadro)
  }, [indice, passos])

  // O cartao sem alvo fica no meio: acompanha a janela mudando de tamanho.
  useEffect(() => {
    const mudou = () => setTela((vez) => vez + 1)
    window.addEventListener('resize', mudou)
    return () => window.removeEventListener('resize', mudou)
  }, [])

  // A altura de verdade do cartao, para encostar no alvo sem passar da tela.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o passo novo e o gatilho; a altura e lida do DOM.
  useLayoutEffect(() => {
    const altura = cartao.current?.offsetHeight
    if (altura && altura !== alturaDoCartao) setAlturaDoCartao(altura)
  }, [visto?.indice, alturaDoCartao])

  // O foco fica no Proximo: Enter anda, sem precisar do mouse.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o passo novo e o gatilho do foco.
  useEffect(() => {
    proximo.current?.focus({ preventScroll: true })
  }, [visto?.indice])

  // Ao fechar, o foco volta para quem abriu o guia.
  useEffect(() => {
    const quemAbriu = document.activeElement as HTMLElement | null
    return () => quemAbriu?.focus?.({ preventScroll: true })
  }, [])

  // As teclas do guia, antes de qualquer outra: setas andam, Esc sai, Tab circula dentro
  // do cartao. Os atalhos da tela ("/", J e K) ficam parados ate o fim.
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Enter' || evento.key === ' ') return
      if (evento.key === 'Tab') {
        const botoes = [...(cartao.current?.querySelectorAll<HTMLElement>('button') ?? [])]
        const onde = botoes.indexOf(document.activeElement as HTMLElement)
        const seguinte = botoes[(onde + (evento.shiftKey ? -1 : 1) + botoes.length) % botoes.length]
        evento.preventDefault()
        seguinte?.focus()
        return
      }
      evento.stopPropagation()
      if (evento.key === 'ArrowRight') {
        evento.preventDefault()
        andarRef.current(1)
      } else if (evento.key === 'ArrowLeft') {
        evento.preventDefault()
        andarRef.current(-1)
      } else if (evento.key === 'Escape') {
        evento.preventDefault()
        fecharRef.current()
      } else {
        evento.preventDefault()
      }
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [])

  const passo = visto ? passos[visto.indice] : undefined
  const caixa = visto?.caixa ?? null
  const largura = Math.min(LARGURA, window.innerWidth - 2 * MARGEM)
  const lugar = lugarDoCartao(caixa, { width: largura, height: alturaDoCartao })
  // Sem alvo, o recorte se fecha num ponto no meio: a tela escurece por igual.
  const recorte = caixa ?? {
    left: window.innerWidth / 2,
    top: window.innerHeight / 2,
    width: 0,
    height: 0,
  }
  const posicao = visto ? visto.indice + 1 : 1
  const ultimo = posicao === passos.length

  // **O cartao e um dialogo do Radix**, e nao uma caixa solta: aberto por cima de outro
  // dialogo (o card), o Radix pausa o foco do de baixo e nao o fecha no clique do de
  // cima. Com uma caixa solta, o primeiro "Proximo" fechava o card.
  return (
    <Dialog.Root open onOpenChange={(abrir) => !abrir && fechar()}>
      <Dialog.Portal>
        <div
          className={cn(
            'fixed inset-0 z-toast animate-fade-in transition-opacity duration-150 motion-reduce:transition-none',
            saindo && 'pointer-events-none opacity-0',
          )}
        >
          {/* Por baixo de tudo do guia: segura o clique e a roda, para nada mudar atras. */}
          <div className="absolute inset-0" />
          {/* O recorte aceso: a sombra enorme e o escuro da tela, e o recorte e o que sobra. */}
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute rounded-xl transition-[left,top,width,height] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none',
              caixa && 'ring-2 ring-accent',
            )}
            style={{ ...recorte, boxShadow: '0 0 0 200vmax var(--overlay)' }}
          />
          {passo && (
            <Dialog.Content
              ref={cartao}
              // O foco nasce no Proximo, e o Esc e as setas sao do guia (ver o ouvinte acima).
              onOpenAutoFocus={(evento) => {
                evento.preventDefault()
                proximo.current?.focus({ preventScroll: true })
              }}
              onEscapeKeyDown={(evento) => evento.preventDefault()}
              // Fora do cartao nao e "sair": o guia so fecha pelo Sair, pelo Esc ou no fim.
              onPointerDownOutside={(evento) => evento.preventDefault()}
              onInteractOutside={(evento) => evento.preventDefault()}
              className="absolute rounded-xl border border-border bg-surface-raised p-4 pb-3 shadow-lg transition-[left,top] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none dark:bg-surface-strong"
              style={{ left: lugar.left, top: lugar.top, width: largura }}
            >
              <div key={visto?.indice} className="animate-fade-in" aria-live="polite">
                <p className="mb-1.5 text-caption text-fg-muted">
                  Passo {posicao} de {passos.length}
                </p>
                <Dialog.Title className="mb-1 font-semibold text-body text-fg">
                  {passo.titulo}
                </Dialog.Title>
                <Dialog.Description className="text-detail text-fg-muted leading-relaxed">
                  {passo.texto}
                </Dialog.Description>
              </div>

              <div
                aria-hidden="true"
                className="my-3 h-0.5 overflow-hidden rounded-full bg-surface-sunken"
              >
                <span
                  className="block h-full rounded-full bg-accent transition-[width] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none"
                  style={{ width: `${(posicao / passos.length) * 100}%` }}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={fechar}>
                  Sair
                </Button>
                <span className="flex-1" />
                {posicao > 1 && (
                  <Button size="sm" onClick={() => andar(-1)}>
                    Voltar
                  </Button>
                )}
                <Button ref={proximo} size="sm" variant="primary" onClick={() => andar(1)}>
                  {ultimo ? 'Concluir' : 'Próximo'}
                </Button>
              </div>
            </Dialog.Content>
          )}
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
