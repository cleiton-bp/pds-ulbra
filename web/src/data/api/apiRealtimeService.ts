import type { HubConnection } from '@microsoft/signalr'
import type {
  AccessLostNotice,
  CardChangedNotice,
  NotificationArrivedNotice,
  ProjectChangedNotice,
  RealtimeTicketViewModel,
} from '@/contracts'
import { apiPost, clearRealtimeConnectionId, setRealtimeConnectionId } from '@/data/api/httpClient'
import { environment } from '@/data/environment'
import type { RealtimeConnection, RealtimeHandlers, RealtimeService } from '@/data/realtimeService'

/**
 * A biblioteca do tempo real vem **so quando a tela de Trabalho abre**, num pedaco
 * proprio do pacote: as outras telas do painel nao pagam por ela. Uma vez carregada,
 * fica.
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
 * Quanto esperar antes de cada nova tentativa: logo, depois cada vez mais devagar, e
 * dali em diante a cada 30 segundos — **para sempre**. Desistir deixaria a tela
 * parada sem dizer, e quem volta do almoco com a aba aberta precisa que ela volte
 * sozinha.
 */
const ESPERAS_MS = [0, 2_000, 5_000, 10_000]
const ESPERA_MAXIMA_MS = 30_000
export const esperaDaTentativa = (tentativa: number) => ESPERAS_MS[tentativa] ?? ESPERA_MAXIMA_MS

/**
 * Abre a conexao em tempo real da tela de Trabalho de um projeto.
 *
 * **Cada abertura pede um bilhete** (`POST /realtime/ticket`, com a sessao de sempre):
 * e ele, e nao o token da sessao, que vai no endereco da conexao. Reconectar pede outro.
 *
 * **O eco da propria aba e ignorado**: o id desta conexao vai em todo pedido da aba
 * (`X-Realtime-Connection`), e o aviso que ele causar volta com ele.
 *
 * **Caiu, reconecta; voltou, rele.** A biblioteca tenta de novo sozinha, pelas esperas
 * acima; se a conexao fechar de vez (o servidor a encerrou sem deixar voltar, ou entrar
 * no projeto falhou ao voltar), uma nova e aberta do zero. Ao voltar, a conexao entra de novo no projeto — os grupos do hub sao
 * da conexao, e a nova nao herda nada — e a tela rele tudo. A primeira conexao que so
 * abriu depois de falhar tambem manda reler: a tela ja tinha lido, e o que mudou entre
 * uma coisa e outra nao veio por aviso nenhum.
 *
 * **As esperas so voltam ao comeco com a conexao dentro do projeto**: a que abre e nao
 * consegue entrar (a API de pe, o hub com problema) nao fica tentando sem parar.
 */
function connectWork(projectPublicId: string, handlers: RealtimeHandlers): RealtimeConnection {
  let parado = false
  let tentativa = 0
  let espera: ReturnType<typeof setTimeout> | null = null
  let conexao: HubConnection | null = null
  /** O id que esta conexao pos nos pedidos da aba. */
  let cabecalho: string | null = null
  const sairDoCabecalho = () => {
    clearRealtimeConnectionId(cabecalho)
    cabecalho = null
  }

  const doProjeto = (aviso: { ProjectPublicId: string }) =>
    aviso.ProjectPublicId === projectPublicId
  const meu = (aviso: { Origin: string | null }) =>
    aviso.Origin !== null && aviso.Origin === conexao?.connectionId

  async function entrar(atual: HubConnection): Promise<boolean> {
    const dentro = await atual.invoke<boolean>('Watch', projectPublicId)
    // A tela saiu, ou outra conexao tomou o lugar, enquanto esta entrava: nada aqui e
    // mais dela.
    if (parado || atual !== conexao) return false
    if (!dentro) {
      handlers.onEvent({ kind: 'access-lost' })
      return false
    }
    cabecalho = atual.connectionId
    setRealtimeConnectionId(cabecalho)
    tentativa = 0
    handlers.onStatus('live')
    return true
  }

  async function montar(): Promise<HubConnection> {
    const { HubConnectionBuilder, LogLevel } = await signalR()
    const nova = new HubConnectionBuilder()
      .withUrl(`${environment.apiUrl}/realtime/hub`, {
        accessTokenFactory: async () =>
          (await apiPost<RealtimeTicketViewModel>('/realtime/ticket')).Ticket,
        // A sessao vai no bilhete, e nao em cookie: pedir credencial faria o navegador
        // exigir um CORS que a API, de proposito, nao da.
        withCredentials: false,
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: ({ previousRetryCount }) =>
          esperaDaTentativa(previousRetryCount),
      })
      // O estado da conexao aparece na tela; o console fica para quem desenvolve.
      .configureLogging(LogLevel.None)
      .build()

    nova.on('CardChanged', (aviso: CardChangedNotice) => {
      if (doProjeto(aviso) && !meu(aviso)) handlers.onEvent({ kind: 'card', notice: aviso })
    })
    nova.on('ProjectChanged', (aviso: ProjectChangedNotice) => {
      if (doProjeto(aviso) && !meu(aviso)) handlers.onEvent({ kind: 'project' })
    })
    nova.on('AccessLost', (aviso: AccessLostNotice) => {
      if (doProjeto(aviso)) handlers.onEvent({ kind: 'access-lost' })
    })
    nova.on('NotificationArrived', (aviso: NotificationArrivedNotice) => {
      if (doProjeto(aviso)) handlers.onEvent({ kind: 'notification' })
    })

    nova.onreconnecting(() => {
      sairDoCabecalho()
      handlers.onStatus('reconnecting')
    })
    nova.onreconnected(async () => {
      try {
        if (await entrar(nova)) handlers.onEvent({ kind: 'resync' })
      } catch {
        // Entrar falhou com a conexao de pe: ela cai e volta pelo caminho de sempre.
        void nova.stop()
      }
    })
    nova.onclose(() => {
      sairDoCabecalho()
      if (parado) return
      handlers.onStatus('reconnecting')
      agendar()
    })

    return nova
  }

  /** Abre do zero; falhando, tenta de novo pelas mesmas esperas da reconexao. */
  async function abrir(voltou: boolean) {
    espera = null
    if (parado) return

    try {
      conexao = await montar()
    } catch {
      // Nem a biblioteca veio (a rede caiu no meio da troca de versao): de novo, depois.
      agendar()
      return
    }
    if (parado) return
    try {
      await conexao.start()
      if (parado) {
        void conexao.stop()
        return
      }
      if ((await entrar(conexao)) && voltou) handlers.onEvent({ kind: 'resync' })
    } catch {
      if (parado) return
      // A conexao que nao abriu nao chama `onclose`: a nova tentativa e daqui. A que
      // abriu e nao conseguiu entrar no projeto e fechada, e o `onclose` recomeca.
      const { HubConnectionState } = await signalR()
      if (conexao.state === HubConnectionState.Disconnected) agendar()
      else void conexao.stop()
    }
  }

  /** A proxima tentativa: toda conexao que abre depois de uma falha manda reler. */
  function agendar() {
    if (parado || espera !== null) return
    const ms = esperaDaTentativa(tentativa)
    tentativa += 1
    espera = setTimeout(() => void abrir(true), ms)
  }

  handlers.onStatus('connecting')
  void abrir(false)

  return {
    async stop() {
      parado = true
      if (espera !== null) clearTimeout(espera)
      sairDoCabecalho()
      await conexao?.stop()
    },
  }
}

export const apiRealtimeService: RealtimeService = { connectWork }
