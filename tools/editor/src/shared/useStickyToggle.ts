import { useCallback, useEffect, useState } from 'react'

/**
 * Um liga/desliga que sobrevive ao recarregar a pagina.
 *
 * Serve para os paineis laterais: quem fechou a lista de arquivos para ganhar espaco
 * nao quer encontrar ela aberta de novo no proximo `npm run dev`.
 */
export function useStickyToggle(key: string, initial: boolean): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored === null ? initial : stored === '1'
    } catch {
      return initial // navegador com armazenamento bloqueado: segue sem persistir
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, value ? '1' : '0')
    } catch { /* idem */ }
  }, [key, value])

  // O terceiro, o valor explicito: quem leva a tela a um estado (o tour) pede "aberto",
  // e nao "inverta": pedido duas vezes, continua aberto.
  return [value, useCallback(() => setValue((v) => !v), []), setValue]
}
