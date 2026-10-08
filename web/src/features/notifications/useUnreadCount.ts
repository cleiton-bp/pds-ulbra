import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { notificationService } from '@/data'
import { onNotificationArrival, playNotificationSound } from '@/features/notifications/sounds'

/** De quanto em quanto tempo o sino pergunta de novo, com a aba a vista. */
export const UNREAD_POLL_MS = 60_000

/**
 * O numero do sino.
 *
 * **Ao vivo na tela de Trabalho, e perguntando nas outras.** A conexao ao vivo so
 * existe na tela de Trabalho: o aviso que chega por ela faz o sino perguntar na hora.
 * Fora dela, ele pergunta ao abrir o painel, a cada troca de tela, ao voltar para a aba
 * e a cada minuto com a aba a vista — a pergunta e um numero, e e barata.
 *
 * **O numero que sobe toca o som** do tipo do aviso mais novo, no volume que a pessoa
 * escolheu no Perfil. O primeiro numero da tela nao toca: e o que ja estava la.
 *
 * **A resposta atrasada nao passa por cima**: marcar como lido devolve o numero novo, e
 * a pergunta que saiu antes dele, chegando depois, e descartada.
 */
export function useUnreadCount() {
  const [count, setCountState] = useState(0)
  const { pathname } = useLocation()
  const vez = useRef(0)
  /** O ultimo numero conhecido; nulo antes da primeira resposta. */
  const conhecido = useRef<number | null>(null)

  const refresh = useCallback(() => {
    const minha = ++vez.current
    notificationService
      .countUnread()
      .then((resposta) => {
        if (minha !== vez.current) return
        const antes = conhecido.current
        conhecido.current = resposta.UnreadCount
        if (antes !== null && resposta.UnreadCount > antes) void tocarOMaisNovo()
        setCountState(resposta.UnreadCount)
      })
      .catch(() => {
        // Sem rede ou sem sessao: o numero fica como estava, e a proxima pergunta tenta.
      })
  }, [])

  /** O numero que uma acao devolveu: vale mais que qualquer pergunta em voo. */
  const setCount = useCallback((valor: number) => {
    vez.current += 1
    conhecido.current = valor
    setCountState(valor)
  }, [])

  // O aviso que chega pelo tempo real: pergunta agora, sem esperar o minuto.
  useEffect(() => onNotificationArrival(refresh), [refresh])

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

/**
 * Toca o som do aviso mais novo que a pessoa nao leu, com o volume dela. As
 * preferencias sao lidas na hora: quem acabou de mudar no Perfil ouve o som novo.
 */
async function tocarOMaisNovo() {
  try {
    const [lista, ajustes] = await Promise.all([
      notificationService.listNotifications(),
      notificationService.getSettings(),
    ])
    const novo = lista.Items.find((aviso) => aviso.ReadAt === null)
    if (!novo) return
    const som = ajustes.Sounds.find((linha) => linha.Kind === novo.Kind)?.Sound ?? 'None'
    playNotificationSound(som, ajustes.Volume)
  } catch {
    // Sem as preferencias, sem som: o numero do sino ja diz.
  }
}
