import { useEffect, useRef } from 'react'
import { realtimeService } from '@/data'
import { announceNotificationArrival } from '@/shared/lib/notificationSounds'

/** Quanto esperar depois do ultimo aviso: uma rajada de relatos vira uma recontagem so. */
const ESPERA_MS = 600

/**
 * Os avisos de card do projeto, para a Moderacao recontar as abas.
 *
 * **A mesma conexao do Trabalho, e so a contagem.** O aviso nao diz o que mudou no
 * card — um comentario, uma coluna, uma decisao —, e reler a lista a cada um
 * embaralharia a fila debaixo de quem le. Entao a tela so reconta, uma vez por rajada,
 * e diz quantos chegaram. O eco da propria aba ja vem filtrado pelo servico.
 *
 * O aviso para a pessoa (o sino) toca aqui como no Trabalho: a conexao e a mesma, e
 * quem esta moderando tambem e avisado.
 */
export function useAvisosDeCard(projectPublicId: string, aoMudar: () => void) {
  const atual = useRef(aoMudar)
  atual.current = aoMudar

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | null = null
    const conexao = realtimeService.connectWork(projectPublicId, {
      onEvent: (evento) => {
        if (evento.kind === 'notification') {
          announceNotificationArrival()
          return
        }
        if (evento.kind !== 'card' && evento.kind !== 'resync') return
        if (espera) clearTimeout(espera)
        espera = setTimeout(() => {
          espera = null
          atual.current()
        }, ESPERA_MS)
      },
      // O estado da conexao nao aparece aqui: sem ela, a tela continua decidindo, e a
      // contagem so deixa de se atualizar sozinha.
      onStatus: () => {},
    })
    return () => {
      if (espera) clearTimeout(espera)
      void conexao.stop()
    }
  }, [projectPublicId])
}
