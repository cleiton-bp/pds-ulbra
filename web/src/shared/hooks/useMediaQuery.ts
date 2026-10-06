import { useSyncExternalStore } from 'react'

/**
 * Se a consulta de midia vale agora, e acompanha a mudanca (girar o celular,
 * arrastar a janela).
 *
 * Sem `matchMedia` — o ambiente dos testes — responde falso: a tela cai no desenho
 * estreito, que e o que funciona em qualquer largura.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const lista = window.matchMedia?.(query)
      lista?.addEventListener('change', avisar)
      return () => lista?.removeEventListener('change', avisar)
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  )
}
