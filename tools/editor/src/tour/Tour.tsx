import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../shared/Icon'
import type { TourStep } from './steps'

type Box = { left: number; top: number; width: number; height: number }

/** Quanto esperar o alvo aparecer (o painel desliza ao abrir) antes de pular o passo. */
const WAIT_MS = 700
/** O tempo do tour esmaecendo ao sair: o mesmo `--fast` do CSS. */
const FADE_MS = 160
/** A folga do destaque em volta do alvo. */
const PAD = 6
/** A distancia entre o alvo e o cartao, e do cartao ate a borda da tela. */
const GAP = 14
const MARGIN = 12
const CARD_WIDTH = 320

type Side = 'bottom' | 'top' | 'right' | 'left'

/**
 * Onde o cartao fica: encostado no alvo, do lado em que cabe; ao lado das partes
 * altas (as laterais), embaixo ou em cima das baixas (os botoes da barra). Alvo que
 * ocupa a tela quase inteira (o desenho) leva o cartao para dentro dele, embaixo.
 * Sem alvo, no meio da tela.
 */
function placeCard(box: Box | null, card: { width: number; height: number }): { left: number; top: number } {
  const screenW = window.innerWidth
  const screenH = window.innerHeight
  const clampX = (x: number): number => Math.min(screenW - card.width - MARGIN, Math.max(MARGIN, x))
  const clampY = (y: number): number => Math.min(screenH - card.height - MARGIN, Math.max(MARGIN, y))
  if (!box) return { left: clampX((screenW - card.width) / 2), top: clampY((screenH - card.height) / 2) }

  const midX = clampX(box.left + box.width / 2 - card.width / 2)
  const midY = clampY(box.top + box.height / 2 - card.height / 2)
  const sides: Record<Side, { left: number; top: number; fits: boolean }> = {
    bottom: { left: midX, top: box.top + box.height + GAP, fits: box.top + box.height + GAP + card.height <= screenH - MARGIN },
    top: { left: midX, top: box.top - GAP - card.height, fits: box.top - GAP - card.height >= MARGIN },
    right: { left: box.left + box.width + GAP, top: midY, fits: box.left + box.width + GAP + card.width <= screenW - MARGIN },
    left: { left: box.left - GAP - card.width, top: midY, fits: box.left - GAP - card.width >= MARGIN },
  }
  const order: Side[] = box.height > screenH / 2 ? ['right', 'left', 'bottom', 'top'] : ['bottom', 'top', 'right', 'left']
  const side = order.find((name) => sides[name].fits)
  if (side) return { left: sides[side].left, top: sides[side].top }
  return { left: midX, top: clampY(box.top + box.height - card.height - 2 * GAP) }
}

/**
 * O tour do editor: a tela escurece, a parte da vez fica acesa, e um cartao conta
 * para que ela serve. Proximo e Voltar andam (as setas tambem), Esc ou Sair fecham.
 *
 * O roteiro vem de `steps.ts`. A cada passo o tour pede ao ambiente o estado da tela
 * daquele passo (`stage`): voltar e so pedir o do passo anterior. Ao sair, pede
 * `null`: a tela volta a ser o que era antes do tour.
 *
 * Enquanto ele esta aberto, o resto da tela nao responde: nem clique, nem roda, nem
 * atalho. O tour mostra; quem mexe e a pessoa, depois.
 */
export default function Tour<Stage>({
  steps, stage, onClose,
}: {
  steps: TourStep<Stage>[]
  stage: (value: Stage | null) => void
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  // O que esta na tela: o passo e a caixa do alvo. Muda so quando o alvo do passo
  // novo foi achado: o passo pulado nao chega a piscar.
  const [shown, setShown] = useState<{ index: number; box: Box | null } | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [cardHeight, setCardHeight] = useState(190)
  const [, setScreen] = useState(0)
  const direction = useRef<1 | -1>(1)
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  // Os ouvintes de tecla e o laco do alvo leem sempre a versao atual.
  const stageRef = useRef(stage)
  stageRef.current = stage

  const close = useCallback((): void => {
    if (leaving) return
    setLeaving(true)
    // A tela volta enquanto o tour esmaece: ao sumir, ja esta como estava.
    stageRef.current(null)
    window.setTimeout(onClose, FADE_MS)
  }, [leaving, onClose])

  const go = useCallback((delta: 1 | -1): void => {
    const next = index + delta
    if (next < 0) return
    if (next >= steps.length) { close(); return }
    direction.current = delta
    setIndex(next)
  }, [index, steps.length, close])

  const closeRef = useRef(close)
  closeRef.current = close
  const goRef = useRef(go)
  goRef.current = go

  // A tela do passo. Pedir o mesmo estado duas vezes nao muda nada (o modo estrito
  // do React roda o efeito duas vezes).
  useEffect(() => {
    stageRef.current(steps[index]?.stage ?? ({} as Stage))
  }, [index, steps])

  // Acha o alvo e o acompanha a cada quadro: o painel deslizando, a janela mudando
  // de tamanho. Alvo que nao aparece a tempo leva ao proximo passo na mesma direcao.
  useEffect(() => {
    const target = steps[index]?.target
    if (!target) { setShown({ index, box: null }); return }
    const started = performance.now()
    let frame = 0
    let found = ''
    const tick = (): void => {
      const rect = document.querySelector(`[data-tour="${target}"]`)?.getBoundingClientRect()
      if (rect && rect.width > 0 && rect.height > 0) {
        const box = { left: rect.left - PAD, top: rect.top - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD }
        const key = [box.left, box.top, box.width, box.height].map(Math.round).join()
        if (key !== found) { found = key; setShown({ index, box }) }
      } else if (!found && performance.now() - started > WAIT_MS) {
        const next = index + direction.current
        if (next >= steps.length) closeRef.current()
        else if (next < 0) { direction.current = 1; setIndex(index + 1) }
        else setIndex(next)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [index, steps])

  // O cartao sem alvo fica no meio: acompanha a janela mudando de tamanho.
  useEffect(() => {
    const onResize = (): void => setScreen((count) => count + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // A altura de verdade do cartao, para encostar no alvo sem passar da tela.
  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight
    if (height && height !== cardHeight) setCardHeight(height)
  }, [shown?.index, cardHeight])

  // O foco fica no Proximo: Enter anda, sem precisar do mouse.
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true })
  }, [shown?.index])

  // Ao fechar, o foco volta para quem abriu o tour.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    return () => opener?.focus?.({ preventScroll: true })
  }, [])

  // As teclas do tour, antes de qualquer outra: setas andam, Esc sai, Tab circula
  // dentro do cartao. Os atalhos da tela (Alt+1, ⌘K…) ficam parados ate o fim.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' || event.key === ' ') return // o botao com foco responde
      if (event.key === 'Tab') {
        const buttons = [...(cardRef.current?.querySelectorAll<HTMLElement>('button') ?? [])]
        const at = buttons.indexOf(document.activeElement as HTMLElement)
        const next = buttons[(at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]
        event.preventDefault()
        next?.focus()
        return
      }
      event.stopPropagation()
      if (event.key === 'ArrowRight') { event.preventDefault(); goRef.current(1) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); goRef.current(-1) }
      else if (event.key === 'Escape') { event.preventDefault(); closeRef.current() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const step = shown ? steps[shown.index] : undefined
  const box = shown?.box ?? null
  const card = placeCard(box, { width: Math.min(CARD_WIDTH, window.innerWidth - 2 * MARGIN), height: cardHeight })
  // Sem alvo, o destaque se fecha num ponto no meio da tela: tudo escurece por igual.
  const spot = box ?? { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 }
  const position = shown ? shown.index + 1 : 1
  const last = position === steps.length

  return createPortal(
    <div className={`tour-guide${leaving ? ' is-leaving' : ''}`}>
      <div className="tour-guide__blocker" />
      <div className={`tour-guide__spot${box ? '' : ' is-empty'}`} style={spot} />
      {step && (
        <div
          ref={cardRef}
          className="tour-guide__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-guide-title"
          aria-describedby="tour-guide-text"
          style={{ left: card.left, top: card.top, width: Math.min(CARD_WIDTH, window.innerWidth - 2 * MARGIN) }}
        >
          <div key={shown?.index} className="tour-guide__body" aria-live="polite">
            <p className="tour-guide__count">Passo {position} de {steps.length}</p>
            <h2 id="tour-guide-title" className="tour-guide__title">{step.title}</h2>
            <p id="tour-guide-text" className="tour-guide__text">{step.text}</p>
          </div>

          <div className="tour-guide__progress" aria-hidden="true">
            <span style={{ width: `${(position / steps.length) * 100}%` }} />
          </div>

          <div className="tour-guide__actions">
            <button className="btn btn--ghost" onClick={close}>Sair</button>
            <span className="tour-guide__spacer" />
            {position > 1 && (
              <button className="btn" onClick={() => go(-1)}>
                <Icon name="chevronLeft" size={14} />
                <span>Voltar</span>
              </button>
            )}
            <button ref={nextRef} className="btn btn--primary" onClick={() => go(1)}>
              <span>{last ? 'Concluir' : 'Próximo'}</span>
              {!last && <Icon name="chevronRight" size={14} />}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
