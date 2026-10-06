// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeEvent, RealtimeHandlers, RealtimeStatus } from '@/data/realtimeService'

/**
 * O QUE ESTES TESTES TRAVAM: a conexao em tempo real da tela de Trabalho.
 *
 * - **O bilhete, e nao a sessao, abre a conexao** — e cada abertura pede um.
 * - **O eco da propria aba e ignorado**, e o aviso de outro projeto tambem.
 * - **Fora do time, nada chega** — e a tela fica sabendo.
 * - **Caiu, volta sozinha, para sempre**; ao voltar, entra de novo no projeto e manda
 *   reler tudo. Fechada de proposito, nao tenta mais.
 * - **As esperas so recomecam com a conexao dentro do projeto** — a que abre e nao
 *   entra nao tenta sem parar.
 * - **O id no cabecalho e da conexao que o pos**: a que sai atrasada nao apaga o da
 *   que a substituiu.
 */
const sinal = vi.hoisted(() => {
  class Conexao {
    connectionId = 'esta-aba'
    state = 'Disconnected'
    ouvintes = new Map<string, (aviso: unknown) => void>()
    aoReconectando: () => void = () => {}
    aoReconectado: () => Promise<void> = async () => {}
    aoFechar: () => void = () => {}
    start = vi.fn(async () => {
      if (sinal.falhasAoAbrir > 0) {
        sinal.falhasAoAbrir -= 1
        throw new Error('sem rede')
      }
      this.state = 'Connected'
    })
    // Como a de verdade: fechar chama o `onclose`.
    stop = vi.fn(async () => {
      this.state = 'Disconnected'
      this.aoFechar()
    })
    invoke = vi.fn(async () => {
      if (sinal.entrarFalha) throw new Error('hub com problema')
      await sinal.segurarEntrada
      return sinal.dentroDoTime
    })
    on(nome: string, ouvinte: (aviso: unknown) => void) {
      this.ouvintes.set(nome, ouvinte)
    }
    onreconnecting(ouvinte: () => void) {
      this.aoReconectando = ouvinte
    }
    onreconnected(ouvinte: () => Promise<void>) {
      this.aoReconectado = ouvinte
    }
    onclose(ouvinte: () => void) {
      this.aoFechar = ouvinte
    }
  }

  const sinal = {
    criadas: [] as Conexao[],
    url: '',
    bilhete: undefined as undefined | (() => Promise<string>),
    falhasAoAbrir: 0,
    dentroDoTime: true,
    entrarFalha: false,
    segurarEntrada: Promise.resolve() as Promise<void>,
    Conexao,
  }
  return sinal
})

vi.mock('@microsoft/signalr', () => {
  class HubConnectionBuilder {
    withUrl(url: string, opcoes: { accessTokenFactory: () => Promise<string> }) {
      sinal.url = url
      sinal.bilhete = opcoes.accessTokenFactory
      return this
    }
    withAutomaticReconnect() {
      return this
    }
    configureLogging() {
      return this
    }
    build() {
      const conexao = new sinal.Conexao()
      sinal.criadas.push(conexao)
      return conexao
    }
  }
  return {
    HubConnectionBuilder,
    HubConnectionState: { Disconnected: 'Disconnected', Connected: 'Connected' },
    LogLevel: { None: 6 },
  }
})

// O cabecalho da aba, com a mesma regra do cliente HTTP (testada no teste dele).
const http = vi.hoisted(() => {
  const http = {
    pedido: vi.fn(async () => ({ Ticket: 'bilhete-de-um-minuto', ExpiresAt: '' })),
    cabecalho: null as string | null,
    conexaoDaAba: vi.fn((id: string | null) => {
      http.cabecalho = id
    }),
    tirarDaAba: vi.fn((id: string | null) => {
      if (id !== null && http.cabecalho === id) http.cabecalho = null
    }),
  }
  return http
})
vi.mock('@/data/api/httpClient', () => ({
  apiPost: http.pedido,
  setRealtimeConnectionId: http.conexaoDaAba,
  clearRealtimeConnectionId: http.tirarDaAba,
}))

const { apiRealtimeService, esperaDaTentativa } = await import('@/data/api/apiRealtimeService')

function ouvir() {
  const eventos: RealtimeEvent[] = []
  const estados: RealtimeStatus[] = []
  const handlers: RealtimeHandlers = {
    onEvent: (evento) => eventos.push(evento),
    onStatus: (status) => estados.push(status),
  }
  return { eventos, estados, handlers }
}

const aviso = (projeto: string, origem: string | null) => ({
  ProjectPublicId: projeto,
  ReportPublicId: 'card-1',
  StatePublicId: 'coluna-2',
  Archived: false,
  Origin: origem,
})

describe('a conexao em tempo real', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sinal.criadas.length = 0
    sinal.falhasAoAbrir = 0
    sinal.dentroDoTime = true
    sinal.entrarFalha = false
    sinal.segurarEntrada = Promise.resolve()
    http.pedido.mockClear()
    http.conexaoDaAba.mockClear()
    http.tirarDaAba.mockClear()
    http.cabecalho = null
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('abre com um bilhete, entra no projeto, e cada pedido da aba passa a dizer qual conexao e', async () => {
    const { estados, handlers } = ouvir()
    apiRealtimeService.connectWork('p-1', handlers)
    await vi.runAllTimersAsync()

    expect(sinal.url).toMatch(/\/realtime\/hub$/)
    expect(await sinal.bilhete?.()).toBe('bilhete-de-um-minuto')
    expect(http.pedido).toHaveBeenCalledWith('/realtime/ticket')
    expect(sinal.criadas[0]?.invoke).toHaveBeenCalledWith('Watch', 'p-1')
    expect(http.cabecalho).toBe('esta-aba')
    expect(estados).toEqual(['connecting', 'live'])
  })

  it('ignora o eco da propria aba e o aviso de outro projeto', async () => {
    const { eventos, handlers } = ouvir()
    apiRealtimeService.connectWork('p-1', handlers)
    await vi.runAllTimersAsync()
    const cardMudou = sinal.criadas[0]?.ouvintes.get('CardChanged')
    const projetoMudou = sinal.criadas[0]?.ouvintes.get('ProjectChanged')

    cardMudou?.(aviso('p-1', 'esta-aba'))
    cardMudou?.(aviso('p-2', 'outra-aba'))
    projetoMudou?.({ ProjectPublicId: 'p-1', Origin: 'esta-aba' })
    expect(eventos).toEqual([])

    cardMudou?.(aviso('p-1', 'outra-aba'))
    // Sem origem: veio de fora do painel (quem relatou, a fila).
    cardMudou?.(aviso('p-1', null))
    projetoMudou?.({ ProjectPublicId: 'p-1', Origin: null })
    expect(eventos.map((evento) => evento.kind)).toEqual(['card', 'card', 'project'])
  })

  it('fora do time, nada chega, e a tela fica sabendo', async () => {
    sinal.dentroDoTime = false
    const { eventos, estados, handlers } = ouvir()
    apiRealtimeService.connectWork('p-1', handlers)
    await vi.runAllTimersAsync()

    expect(eventos).toEqual([{ kind: 'access-lost' }])
    expect(estados).not.toContain('live')

    sinal.criadas[0]?.ouvintes.get('AccessLost')?.({ ProjectPublicId: 'p-2' })
    expect(eventos).toHaveLength(1)
  })

  it('caiu e voltou: entra de novo no projeto e manda reler tudo', async () => {
    const { eventos, estados, handlers } = ouvir()
    apiRealtimeService.connectWork('p-1', handlers)
    await vi.runAllTimersAsync()
    const conexao = sinal.criadas[0]

    conexao?.aoReconectando()
    expect(http.cabecalho).toBeNull()
    await conexao?.aoReconectado()

    expect(conexao?.invoke).toHaveBeenCalledTimes(2)
    expect(eventos).toEqual([{ kind: 'resync' }])
    expect(estados).toEqual(['connecting', 'live', 'reconnecting', 'live'])
  })

  it('nao abriu: tenta de novo pelas esperas, e para sempre — e ao abrir, manda reler', async () => {
    sinal.falhasAoAbrir = 3
    const { eventos, estados, handlers } = ouvir()
    apiRealtimeService.connectWork('p-1', handlers)

    await vi.advanceTimersByTimeAsync(0)
    expect(sinal.criadas).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(sinal.criadas).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(sinal.criadas).toHaveLength(4)
    expect(estados.at(-1)).toBe('live')
    // A tela ja tinha lido quando a conexao abriu: o que mudou no meio vem pela releitura.
    expect(eventos).toEqual([{ kind: 'resync' }])

    // A espera para de crescer em 30 segundos, e nao desiste.
    expect([0, 1, 2, 3, 4, 50].map(esperaDaTentativa)).toEqual([
      0, 2_000, 5_000, 10_000, 30_000, 30_000,
    ])
  })

  it('fechada de vez — depois de aberta — volta sozinha e manda reler', async () => {
    const { eventos, handlers } = ouvir()
    apiRealtimeService.connectWork('p-1', handlers)
    await vi.runAllTimersAsync()

    sinal.criadas[0]?.aoFechar()
    await vi.runAllTimersAsync()

    expect(sinal.criadas).toHaveLength(2)
    expect(eventos).toEqual([{ kind: 'resync' }])
  })

  it('fechada de proposito depois de aberta — sair da tela — nao conta como queda, e nao reabre', async () => {
    const { estados, handlers } = ouvir()
    const conexao = apiRealtimeService.connectWork('p-1', handlers)
    await vi.runAllTimersAsync()

    await conexao.stop()
    await vi.advanceTimersByTimeAsync(120_000)

    expect(sinal.criadas).toHaveLength(1)
    expect(estados.at(-1)).toBe('live')
  })

  it('abriu e nao conseguiu entrar no projeto: as esperas continuam crescendo, sem tentar sem parar', async () => {
    sinal.entrarFalha = true
    const { estados, handlers } = ouvir()
    apiRealtimeService.connectWork('p-1', handlers)

    await vi.advanceTimersByTimeAsync(0)
    expect(sinal.criadas).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1_999)
    expect(sinal.criadas).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(sinal.criadas).toHaveLength(3)
    expect(estados).not.toContain('live')

    // Entrou: as esperas voltam ao comeco para a proxima queda.
    sinal.entrarFalha = false
    await vi.advanceTimersByTimeAsync(5_000)
    expect(estados.at(-1)).toBe('live')
    sinal.criadas.at(-1)?.aoFechar()
    await vi.advanceTimersByTimeAsync(0)
    expect(sinal.criadas).toHaveLength(5)
  })

  it('parada enquanto entrava no projeto: nao fica no ar, nem poe o id nos pedidos', async () => {
    let entrar: () => void = () => {}
    sinal.segurarEntrada = new Promise((pronto) => {
      entrar = pronto
    })
    const { estados, handlers } = ouvir()
    const conexao = apiRealtimeService.connectWork('p-1', handlers)
    await vi.advanceTimersByTimeAsync(0)

    await conexao.stop()
    entrar()
    await vi.advanceTimersByTimeAsync(0)

    expect(estados).not.toContain('live')
    expect(http.cabecalho).toBeNull()
    expect(http.conexaoDaAba).not.toHaveBeenCalled()
  })

  it('a conexao que sai atrasada nao apaga o id da que a substituiu', async () => {
    const { handlers } = ouvir()
    const velha = apiRealtimeService.connectWork('p-1', handlers)
    await vi.runAllTimersAsync()
    expect(http.cabecalho).toBe('esta-aba')

    // A tela do outro projeto ja entrou, com a conexao dela.
    http.conexaoDaAba('conexao-da-tela-nova')
    await velha.stop()

    expect(http.cabecalho).toBe('conexao-da-tela-nova')
  })

  it('parada de proposito nao tenta de novo', async () => {
    sinal.falhasAoAbrir = 100
    const { handlers } = ouvir()
    const conexao = apiRealtimeService.connectWork('p-1', handlers)
    await vi.advanceTimersByTimeAsync(0)

    await conexao.stop()
    await vi.advanceTimersByTimeAsync(120_000)

    expect(sinal.criadas.length).toBeLessThanOrEqual(2)
    expect(http.cabecalho).toBeNull()
  })
})
