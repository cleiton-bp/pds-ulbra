import type { WidgetAnimationSpeed, WidgetOpenAnimation, WidgetPosition } from '@/embed/launcher'

/**
 * Como o formulario aparece ao clicar no botao, e sai ao fechar. **O carregador aplica
 * isto ao `iframe` na pagina do cliente, e a previa do painel ao da pagina de mentira**,
 * a mesma conta nos dois, como `placeFrame`.
 *
 * A conta devolve so o quadro fechado (de onde ele parte e para onde volta) e a
 * transicao; aberto, ele e sempre opaco e sem deslocamento. O movimento parte do canto do
 * botao, para o formulario parecer sair dele.
 *
 * **Com o movimento reduzido ligado no sistema de quem visita, so esmaece**, qualquer que
 * seja a escolha: deslizar e crescer sao justamente o que essa preferencia pede para tirar.
 */

/** Quanto dura a abertura, em milissegundos. Fechar leva tres quartos disso. */
export const DURACAO_DA_ABERTURA: Record<WidgetAnimationSpeed, number> = {
  Fast: 160,
  Normal: 260,
  Slow: 420,
}

/** Abrir desacelera ate parar no lugar; fechar acelera ao sair, como quem recolhe. */
const CURVA_DE_ABRIR = 'cubic-bezier(0.22, 1, 0.36, 1)'
const CURVA_DE_FECHAR = 'cubic-bezier(0.4, 0, 1, 1)'

export interface FrameMotion {
  /** O quadro fechado: de onde ele parte ao abrir, e para onde volta ao fechar. */
  hidden: { opacity: string; transform: string }
  /** O ponto fixo do movimento: o canto do botao. */
  origin: string
  /** Quanto dura abrir e fechar, em milissegundos. Zero e de uma vez. */
  openMs: number
  closeMs: number
  /** O `transition` de cada sentido. Vazio quando nao ha movimento. */
  openTransition: string
  closeTransition: string
}

export function frameMotion(
  animation: WidgetOpenAnimation,
  speed: WidgetAnimationSpeed,
  position: WidgetPosition,
  reducedMotion: boolean,
  /** A folha do celular (`placeFrame`): ela sobe do pe da tela, e nao sai de um canto. */
  sheet = false,
): FrameMotion {
  const esquerda = position === 'BottomLeft' || position === 'TopLeft'
  const emCima = position === 'TopRight' || position === 'TopLeft'
  const origin = sheet
    ? 'center bottom'
    : `${esquerda ? 'left' : 'right'} ${emCima ? 'top' : 'bottom'}`

  if (animation === 'None') {
    return {
      hidden: { opacity: '0', transform: 'none' },
      origin,
      openMs: 0,
      closeMs: 0,
      openTransition: '',
      closeTransition: '',
    }
  }

  const openMs = DURACAO_DA_ABERTURA[speed]
  const closeMs = Math.round(openMs * 0.75)
  // Sobe quem esta embaixo, desce quem esta em cima; entra pela borda do lado do botao.
  const vertical = emCima ? -1 : 1
  const lateral = esquerda ? -1 : 1

  const transform = reducedMotion
    ? 'none'
    : sheet
      ? // Na folha, deslizar e subir do pe da tela inteira, como as folhas dos aplicativos.
        animation === 'Slide'
        ? 'translateY(100%)'
        : animation === 'Grow'
          ? 'scale(0.94)'
          : 'translateY(24px)'
      : animation === 'Slide'
        ? `translateX(${lateral * 48}px)`
        : animation === 'Grow'
          ? 'scale(0.6)'
          : `translateY(${vertical * 14}px) scale(0.98)`

  const transicao = (ms: number, curva: string) =>
    reducedMotion ? `opacity ${ms}ms ease` : `opacity ${ms}ms ${curva}, transform ${ms}ms ${curva}`

  return {
    hidden: { opacity: '0', transform },
    origin,
    openMs,
    closeMs,
    openTransition: transicao(openMs, CURVA_DE_ABRIR),
    closeTransition: transicao(closeMs, CURVA_DE_FECHAR),
  }
}

/** Se quem visita pediu menos movimento ao sistema. Lido na hora de animar. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  )
}
