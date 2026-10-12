import { useEffect, useState } from 'react'

/** Quanto o item leva para fechar — o `details-smooth`, de 300 ms. */
export const CLOSE_DURATION = 300

/**
 * O item de acordeao que acabou de fechar continua desenhado ate o fim do movimento, sem
 * aceitar nada (`inert`): tirar o editor junto com o `open` fechava o item de uma vez,
 * sem a descida suave dos outros grupos. `value` e o que o editor mostrava ao fechar.
 *
 * Com movimento reduzido (ou sem `matchMedia`, como nos testes) nao ha descida para
 * esperar, e o item fecha na hora.
 */
export function useClosingItem<T>() {
  const [closing, setClosing] = useState<{ id: string; value: T } | null>(null)

  useEffect(() => {
    if (!closing) return
    const relogio = window.setTimeout(() => setClosing(null), CLOSE_DURATION)
    return () => window.clearTimeout(relogio)
  }, [closing])

  function markClosing(id: string, value: T) {
    const semMovimento =
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!semMovimento) setClosing({ id, value })
  }

  return { closing, markClosing }
}
