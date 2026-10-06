// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiGet, clearRealtimeConnectionId, setRealtimeConnectionId } from '@/data/api/httpClient'

/**
 * O QUE ESTE TESTE TRAVA: todo pedido da aba diz qual e a conexao em tempo real dela —
 * e o que deixa a aba ignorar o aviso da mudanca que ela mesma fez. Sem conexao, nada.
 */
describe('o cliente HTTP e a conexao em tempo real', () => {
  afterEach(() => {
    setRealtimeConnectionId(null)
    vi.unstubAllGlobals()
  })

  const pedidoFeito = async () => {
    const buscar = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ Success: true, Message: null, Data: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', buscar)
    await apiGet('/projects')
    const init = buscar.mock.calls[0]?.[1] as RequestInit
    return init.headers as Record<string, string>
  }

  it('com a conexao no ar, o pedido leva o id dela', async () => {
    setRealtimeConnectionId('conexao-desta-aba')
    expect((await pedidoFeito())['X-Realtime-Connection']).toBe('conexao-desta-aba')
  })

  it('sem conexao (caiu, ou a tela nao tem tempo real), o pedido nao leva nada', async () => {
    setRealtimeConnectionId(null)
    expect((await pedidoFeito())['X-Realtime-Connection']).toBeUndefined()
  })

  it('a conexao que sai so tira o proprio id — nao o da que entrou no lugar dela', async () => {
    setRealtimeConnectionId('conexao-nova')
    clearRealtimeConnectionId('conexao-velha')
    expect((await pedidoFeito())['X-Realtime-Connection']).toBe('conexao-nova')

    clearRealtimeConnectionId('conexao-nova')
    expect((await pedidoFeito())['X-Realtime-Connection']).toBeUndefined()
  })
})
