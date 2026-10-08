import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * O QUE ESTES TESTES TRAVAM: os sons dos avisos, gerados no navegador.
 *
 * - **Sem som, ou volume zero, nao abre audio nenhum.**
 * - **Cada som e um punhado de notas**, e o volume da tela vira o da nota — o 100 nao
 *   passa do teto.
 * - **Navegador sem audio** nao quebra: o aviso fica so no sino.
 * - **A chegada de um aviso** chega a quem ouve, e para de chegar a quem saiu.
 */
class Param {
  valores: number[] = []
  setValueAtTime(v: number) {
    this.valores.push(v)
  }
  exponentialRampToValueAtTime(v: number) {
    this.valores.push(v)
  }
}
class No {
  connect(destino: unknown) {
    return destino
  }
}
class Oscilador extends No {
  type = 'sine'
  frequency = new Param()
  start = vi.fn()
  stop = vi.fn()
}
class Ganho extends No {
  gain = new Param()
}
const criados = { contextos: 0, osciladores: [] as Oscilador[], ganhos: [] as Ganho[] }
class Contexto {
  state = 'running'
  currentTime = 0
  destination = {}
  constructor() {
    criados.contextos += 1
  }
  resume = vi.fn()
  createOscillator() {
    const o = new Oscilador()
    criados.osciladores.push(o)
    return o
  }
  createGain() {
    const g = new Ganho()
    criados.ganhos.push(g)
    return g
  }
}

async function carregar() {
  vi.resetModules()
  return import('@/shared/lib/notificationSounds')
}

describe('os sons dos avisos', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    criados.contextos = 0
    criados.osciladores.length = 0
    criados.ganhos.length = 0
  })

  it('sem som, ou com volume zero, nao abre audio', async () => {
    vi.stubGlobal('AudioContext', Contexto)
    const { playNotificationSound } = await carregar()
    playNotificationSound('None', 80)
    playNotificationSound('Bell', 0)
    expect(criados.contextos).toBe(0)
  })

  it('o sino sao tres notas, e o volume da tela vira o da nota, sem passar do teto', async () => {
    vi.stubGlobal('AudioContext', Contexto)
    const { playNotificationSound } = await carregar()
    playNotificationSound('Bell', 100)
    expect(criados.osciladores).toHaveLength(3)
    const picos = criados.ganhos.map((g) => Math.max(...g.gain.valores))
    expect(Math.max(...picos)).toBeLessThanOrEqual(0.35)
    playNotificationSound('Bell', 50)
    const metade = criados.ganhos.slice(3).map((g) => Math.max(...g.gain.valores))
    expect(metade[0]).toBeCloseTo((picos[0] ?? 0) / 2)
    // Um contexto so, reaproveitado.
    expect(criados.contextos).toBe(1)
  })

  it('navegador sem audio nao quebra', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const { playNotificationSound } = await carregar()
    expect(() => playNotificationSound('Ping', 70)).not.toThrow()
  })

  it('a chegada de um aviso chega a quem ouve, e para de chegar a quem saiu', async () => {
    const { announceNotificationArrival, onNotificationArrival } = await carregar()
    const ouvinte = vi.fn()
    const sair = onNotificationArrival(ouvinte)
    announceNotificationArrival()
    sair()
    announceNotificationArrival()
    expect(ouvinte).toHaveBeenCalledTimes(1)
  })
})
