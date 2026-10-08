import { useCallback, useEffect, useRef, useState } from 'react'
import { type RealtimeEvent, type RealtimeStatus, realtimeService } from '@/data'
import { announceNotificationArrival } from '@/features/notifications/sounds'
import type { SemAoVivo } from '@/features/reports/LiveStatus'

export type WorkListener = (evento: RealtimeEvent) => void

/** Quanto tempo a conexao pode ficar fora antes de a tela dizer: piscar a cada queda curta so assusta. */
const AVISAR_QUEDA_MS = 3_000

/**
 * A conexao em tempo real da tela de Trabalho, uma por aba e por projeto.
 *
 * `aoAviso` e quem reage na tela (o quadro, a lista, a contagem). `assinar` deixa o
 * card aberto — rota filha desta tela — ouvir os mesmos avisos sem abrir outra conexao.
 *
 * `caiu` so vira verdadeiro depois de alguns segundos fora: a reconexao comum e rapida,
 * e um selo que pisca a cada uma ensina a nao olhar para ele. `semAoVivo` diz o que a
 * tela mostra: a conexao que nunca abriu e a que caiu nao pedem o mesmo texto.
 */
export function useWorkRealtime(projectPublicId: string, aoAviso: WorkListener) {
  // O estado vem marcado com o projeto: na troca, o da conexao anterior nao vale pela
  // nova nem por uma renderizacao.
  const [estado, setEstado] = useState<{ projeto: string; status: RealtimeStatus } | null>(null)
  const status: RealtimeStatus = estado?.projeto === projectPublicId ? estado.status : 'connecting'
  const [caiu, setCaiu] = useState(false)
  // De qual projeto a conexao ja esteve no ar: trocar de projeto comeca do zero.
  const [noArEm, setNoArEm] = useState<string | null>(null)
  const atual = useRef(aoAviso)
  atual.current = aoAviso
  const ouvintes = useRef(new Set<WorkListener>())

  useEffect(() => {
    const conexao = realtimeService.connectWork(projectPublicId, {
      onEvent: (evento) => {
        // O aviso para a pessoa e do sino, que fica no topo de todas as telas.
        if (evento.kind === 'notification') {
          announceNotificationArrival()
          return
        }
        atual.current(evento)
        for (const ouvinte of ouvintes.current) ouvinte(evento)
      },
      onStatus: (novo) => setEstado({ projeto: projectPublicId, status: novo }),
    })
    return () => {
      void conexao.stop()
    }
  }, [projectPublicId])

  useEffect(() => {
    if (status === 'live') {
      setCaiu(false)
      setNoArEm(projectPublicId)
      return
    }
    const espera = setTimeout(() => setCaiu(true), AVISAR_QUEDA_MS)
    return () => clearTimeout(espera)
  }, [status, projectPublicId])

  const assinar = useCallback((ouvinte: WorkListener) => {
    ouvintes.current.add(ouvinte)
    return () => {
      ouvintes.current.delete(ouvinte)
    }
  }, [])

  const semAoVivo: SemAoVivo = caiu
    ? noArEm === projectPublicId
      ? 'caiu'
      : 'nunca-conectou'
    : null

  return { status, caiu, semAoVivo, assinar }
}
