// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeEvent, RealtimeHandlers } from '@/data'
import { useWorkRealtime } from '@/features/reports/useWorkRealtime'

/**
 * O QUE ESTES TESTES TRAVAM: a conexao da tela de Trabalho, uma por projeto.
 *
 * - **O selo da queda espera uns segundos**: a reconexao comum e rapida, e um selo que
 *   pisca a cada uma ensina a nao olhar para ele. **A conexao que nunca abriu** nao e
 *   "reconectando": o texto e outro.
 * - **O card aberto ouve os mesmos avisos**, sem abrir outra conexao.
 * - **Sair da tela, ou trocar de projeto, fecha a conexao.**
 */
const conexoes = vi.hoisted(() => ({
  abertas: [] as { projeto: string; handlers: RealtimeHandlers; parar: ReturnType<typeof vi.fn> }[],
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    realtimeService: {
      connectWork: (projeto: string, handlers: RealtimeHandlers) => {
        const parar = vi.fn(async () => {})
        conexoes.abertas.push({ projeto, handlers, parar })
        return { stop: parar }
      },
    },
  }
})

const chegada = vi.hoisted(() => ({ avisar: vi.fn() }))

vi.mock('@/shared/lib/notificationSounds', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/shared/lib/notificationSounds')>()
  return { ...real, announceNotificationArrival: chegada.avisar }
})

const ultima = () => conexoes.abertas.at(-1)

describe('a conexao da tela de Trabalho', () => {
  beforeEach(() => {
    conexoes.abertas.length = 0
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('o selo da queda so aparece depois de alguns segundos fora, e some quando volta', () => {
    const { result } = renderHook(() => useWorkRealtime('p-1', () => {}))

    act(() => ultima()?.handlers.onStatus('live'))
    act(() => ultima()?.handlers.onStatus('reconnecting'))
    act(() => vi.advanceTimersByTime(2_900))
    expect(result.current.caiu).toBe(false)

    // Voltou antes dos tres segundos: nada a dizer.
    act(() => ultima()?.handlers.onStatus('live'))
    act(() => vi.advanceTimersByTime(5_000))
    expect(result.current.caiu).toBe(false)

    act(() => ultima()?.handlers.onStatus('reconnecting'))
    act(() => vi.advanceTimersByTime(3_000))
    expect(result.current.caiu).toBe(true)

    act(() => ultima()?.handlers.onStatus('live'))
    expect(result.current.caiu).toBe(false)
  })

  it('a conexao que nunca abriu diz outra coisa que a que caiu — e trocar de projeto comeca do zero', () => {
    const { result, rerender } = renderHook(({ projeto }) => useWorkRealtime(projeto, () => {}), {
      initialProps: { projeto: 'p-1' },
    })

    act(() => ultima()?.handlers.onStatus('connecting'))
    act(() => vi.advanceTimersByTime(3_000))
    expect(result.current.semAoVivo).toBe('nunca-conectou')

    act(() => ultima()?.handlers.onStatus('live'))
    expect(result.current.semAoVivo).toBeNull()
    act(() => ultima()?.handlers.onStatus('reconnecting'))
    act(() => vi.advanceTimersByTime(3_000))
    expect(result.current.semAoVivo).toBe('caiu')

    act(() => ultima()?.handlers.onStatus('live'))
    rerender({ projeto: 'p-2' })
    act(() => vi.advanceTimersByTime(3_000))
    expect(result.current.semAoVivo).toBe('nunca-conectou')
  })

  it('a tela e quem assinou recebem o mesmo aviso, de uma conexao so; quem desassina para de receber', () => {
    const daTela: RealtimeEvent[] = []
    const doCard: RealtimeEvent[] = []
    const { result } = renderHook(() => useWorkRealtime('p-1', (evento) => daTela.push(evento)))

    const desassinar = result.current.assinar((evento) => doCard.push(evento))
    act(() => ultima()?.handlers.onEvent({ kind: 'project' }))
    desassinar()
    act(() => ultima()?.handlers.onEvent({ kind: 'resync' }))

    expect(conexoes.abertas).toHaveLength(1)
    expect(daTela).toEqual([{ kind: 'project' }, { kind: 'resync' }])
    expect(doCard).toEqual([{ kind: 'project' }])
  })

  it('trocar de projeto fecha a conexao do anterior e abre a do novo; sair da tela fecha', () => {
    const { rerender, unmount } = renderHook(({ projeto }) => useWorkRealtime(projeto, () => {}), {
      initialProps: { projeto: 'p-1' },
    })
    const primeira = ultima()

    rerender({ projeto: 'p-2' })
    expect(primeira?.parar).toHaveBeenCalled()
    expect(ultima()?.projeto).toBe('p-2')

    unmount()
    expect(ultima()?.parar).toHaveBeenCalled()
  })
})

describe('o aviso para a pessoa', () => {
  beforeEach(() => {
    conexoes.abertas.length = 0
    chegada.avisar.mockReset()
  })

  it('vai para o sino, e nao para a tela de Trabalho', () => {
    const naTela = vi.fn()
    renderHook(() => useWorkRealtime('p-1', naTela))
    act(() => ultima()?.handlers.onEvent({ kind: 'notification' }))
    expect(chegada.avisar).toHaveBeenCalledTimes(1)
    expect(naTela).not.toHaveBeenCalled()
    act(() => ultima()?.handlers.onEvent({ kind: 'project' }))
    expect(naTela).toHaveBeenCalledWith({ kind: 'project' })
  })
})
