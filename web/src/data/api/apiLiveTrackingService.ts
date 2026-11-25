import type { HubConnection } from '@microsoft/signalr'
import type { PublicReportViewModel } from '@/contracts'
import { environment } from '@/data/environment'
import type { LiveTrackingService } from '@/data/liveTrackingService'

/**
 * A biblioteca do tempo real vem **so quando um relato abre na tela**, num pedaco proprio do
 * pacote: quem abre o formulario para relatar nao paga por ela. Uma vez carregada, fica.
 */
let biblioteca: Promise<typeof import('@microsoft/signalr')> | null = null
const signalR = () => {
  // A que falhou nao fica guardada: a proxima tentativa busca de novo.
  biblioteca ??= import('@microsoft/signalr').catch((falha) => {
    biblioteca = null
    throw falha
  })
  return biblioteca
}

/**
 * Quanto esperar antes de cada nova tentativa: logo, depois cada vez mais devagar, e dali
 * em diante a cada 30 segundos, enquanto a tela estiver aberta. As mesmas do painel.
 */
const ESPERAS_MS = [0, 2_000, 5_000, 10_000]
const ESPERA_MAXIMA_MS = 30_000
export const esperaDoAcompanhamento = (tentativa: number) =>
  ESPERAS_MS[tentativa] ?? ESPERA_MAXIMA_MS

/**
 * O acompanhamento ao vivo pelo hub publico `/realtime/tracking`.
 *
 * **Sem cookie e sem sessao** (`withCredentials: false`): a credencial e a do relato, e vai
 * so na inscricao. **Caiu, reconecta e se inscreve de novo**: os grupos do hub sao da
 * conexao, e a nova nao herda nada; a inscricao devolve o relato de agora, e a tela pega o
 * que mudou enquanto estava fora. **Recusada, para de vez**: tentar de novo a mesma
 * credencial so daria a mesma recusa.
 */
export const apiLiveTrackingService: LiveTrackingService = {
  watch(request, onReport) {
    let parado = false
    let conexao: HubConnection | null = null
    let espera: ReturnType<typeof setTimeout> | null = null
    let tentativa = 0

    async function inscrever(atual: HubConnection) {
      const relato = await atual.invoke<PublicReportViewModel | null>('Watch', request)
      if (parado || atual !== conexao) return
      if (relato === null) {
        parar()
        return
      }
      onReport(relato)
    }

    async function abrir() {
      espera = null
      if (parado) return

      let nova: HubConnection
      try {
        const { HubConnectionBuilder, LogLevel } = await signalR()
        if (parado) return

        nova = new HubConnectionBuilder()
          .withUrl(`${environment.apiUrl}/realtime/tracking`, { withCredentials: false })
          .withAutomaticReconnect({
            nextRetryDelayInMilliseconds: ({ previousRetryCount }) =>
              esperaDoAcompanhamento(previousRetryCount),
          })
          // Quem relata nao ve o console; quem desenvolve olha a rede.
          .configureLogging(LogLevel.None)
          .build()

        nova.on('ReportUpdated', (relato: PublicReportViewModel) => {
          if (!parado && conexao === nova) onReport(relato)
        })
        nova.onreconnected(() => {
          // Inscrever falhou com a conexao de pe: ela cai e volta pelo caminho de sempre.
          inscrever(nova).catch(() => void nova.stop())
        })
        nova.onclose(() => {
          if (!parado && conexao === nova) agendar()
        })

        conexao = nova
        await nova.start()
      } catch {
        // Nao abriu (sem rede, ou a biblioteca nao veio): tenta de novo pelas esperas.
        agendar()
        return
      }

      if (parado) {
        void nova.stop()
        return
      }
      tentativa = 0

      // **Uma conexao so.** A inscricao que falha com a conexao aberta a derruba, e o
      // `onclose` agenda a proxima: abrir outra aqui deixaria duas no ar.
      inscrever(nova).catch(() => void nova.stop())
    }

    function agendar() {
      if (parado || espera !== null) return
      espera = setTimeout(() => void abrir(), esperaDoAcompanhamento(tentativa))
      tentativa += 1
    }

    function parar() {
      parado = true
      if (espera !== null) clearTimeout(espera)
      espera = null
      const atual = conexao
      conexao = null
      void atual?.stop()
    }

    void abrir()
    return { stop: parar }
  },
}
