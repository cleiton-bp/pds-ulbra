import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { notificationService } from '@/data'

/** De quanto em quanto tempo o sino pergunta de novo, com a aba a vista. */
export const UNREAD_POLL_MS = 60_000

/**
 * O numero do sino.
 *
 * **Sem tempo real, de proposito**: a conexao ao vivo so existe na tela de Trabalho, e
 * o sino esta em todas. Ele pergunta ao abrir o painel, a cada troca de tela, ao voltar
 * para a aba e a cada minuto com a aba a vista — a pergunta e um numero, e e barata.
 *
 * **A resposta atrasada nao passa por cima**: marcar como lido devolve o numero novo, e
 * a pergunta que saiu antes dele, chegando depois, e descartada.
 */
export function useUnreadCount() {
  const [count, setCountState] = useState(0)
  const { pathname } = useLocation()
  const vez = useRef(0)

  const refresh = useCallback(() => {
    const minha = ++vez.current
    notificationService
      .countUnread()
      .then((resposta) => {
        if (minha === vez.current) setCountState(resposta.UnreadCount)
      })
      .catch(() => {
        // Sem rede ou sem sessao: o numero fica como estava, e a proxima pergunta tenta.
      })
  }, [])

  /** O numero que uma acao devolveu: vale mais que qualquer pergunta em voo. */
  const setCount = useCallback((valor: number) => {
    vez.current += 1
    setCountState(valor)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: a troca de tela e o gatilho
  useEffect(() => {
    refresh()
  }, [refresh, pathname])

  useEffect(() => {
    const aVista = () => document.visibilityState === 'visible'
    const aoVoltar = () => {
      if (aVista()) refresh()
    }
    const intervalo = setInterval(aoVoltar, UNREAD_POLL_MS)
    window.addEventListener('focus', aoVoltar)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearInterval(intervalo)
      window.removeEventListener('focus', aoVoltar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [refresh])

  return { count, setCount, refresh }
}
