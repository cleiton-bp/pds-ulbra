import { useCallback, useEffect, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * Quanto da janela o desenho guarda para ele: 40% dela, e nunca menos de 520px, o
 * que a barra de cima precisa para caber inteira editando. As laterais dividem o
 * resto: alargar uma nunca espreme o desenho ate sumir.
 */
export function boardRoom(viewport: number): number {
  return Math.max(520, Math.round(viewport * 0.4))
}

/**
 * As larguras que cabem em `room`. Quando as laterais juntas passam dele (a janela
 * estreitou, por exemplo), cada uma cede na proporcao do que tem acima do proprio
 * minimo, e nenhuma fica abaixo dele. Cabendo, ficam como estao.
 */
export function fitSides(
  sides: [{ width: number; min: number }, { width: number; min: number }],
  room: number,
): [number, number] {
  const [a, b] = sides
  const over = a.width + b.width - room
  if (over <= 0) return [a.width, b.width]
  const slackA = Math.max(0, a.width - a.min)
  const slackB = Math.max(0, b.width - b.min)
  if (slackA + slackB <= over) return [Math.min(a.width, a.min), Math.min(b.width, b.min)]
  const cede = (width: number, slack: number): number => Math.round(width - (over * slack) / (slackA + slackB))
  return [cede(a.width, slackA), cede(b.width, slackB)]
}

/**
 * A largura de uma lateral, ajustada arrastando a borda dela, e lembrada no
 * navegador, como o liga/desliga das laterais (ver `useStickyToggle`).
 *
 * `width` e a escolhida; a que vai para a tela pode ser menor, quando nao cabe (ver
 * `fitSides`). Por isso o arrasto parte da largura da tela (`from`) e para em
 * `limit`: a borda encosta no limite e nao passa.
 *
 * `edge` diz de que lado a borda fica: a lista de arquivos cresce para a direita,
 * o painel cresce para a esquerda. Clique duplo na borda volta a largura de fabrica.
 */
export function useResizable(
  key: string,
  { initial, min, max, edge }: { initial: number; min: number; max: number; edge: 'right' | 'left' },
): {
  width: number
  min: number
  set: (value: number) => void
  startDrag: (event: ReactPointerEvent, from: number, limit: number) => void
  reset: () => void
  dragging: boolean
} {
  const clamp = useCallback((value: number, top = max) => Math.min(Math.max(min, top), Math.max(min, Math.round(value))), [min, max])

  const [width, setWidth] = useState<number>(() => {
    try {
      const stored = Number(window.localStorage.getItem(key))
      return stored ? clamp(stored) : initial
    } catch {
      return initial // armazenamento bloqueado: segue sem lembrar
    }
  })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(key, String(width))
    } catch { /* idem */ }
  }, [key, width])

  const startDrag = useCallback((event: ReactPointerEvent, from: number, limit: number): void => {
    event.preventDefault()
    const x = event.clientX
    const top = Math.min(max, limit)
    setDragging(true)

    const onMove = (move: PointerEvent): void => {
      const delta = move.clientX - x
      setWidth(clamp(from + (edge === 'right' ? delta : -delta), top))
    }
    const onUp = (): void => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [clamp, max, edge])

  return {
    width,
    min,
    set: (value: number) => setWidth(clamp(value)),
    startDrag,
    reset: () => setWidth(initial),
    dragging,
  }
}

/**
 * Uma escolha entre poucas opcoes que sobrevive ao recarregar: o irmao de varias
 * opcoes do `useStickyToggle`. Valor desconhecido no armazenamento volta ao padrao.
 */
export function useStickyChoice<T extends string>(
  key: string,
  options: readonly T[],
  initial: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key) as T | null
      return stored && options.includes(stored) ? stored : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, value)
    } catch { /* idem */ }
  }, [key, value])

  return [value, setValue]
}
