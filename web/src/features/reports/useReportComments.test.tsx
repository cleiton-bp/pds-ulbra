// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InternalCommentViewModel } from '@/contracts'
import { COMMENTS_PAGE_SIZE, useReportComments } from '@/features/reports/ReportComments'
import { COMMENT_SEARCH_EVENT } from '@/shared/lib/commentSearch'

/**
 * O QUE ESTES TESTES TRAVAM: a conversa do card aos pedacos.
 *
 * - **Abre com as mais recentes** (`limit`), e as marcas da leitura dizem se ha anteriores.
 * - **As anteriores vem pela mais antiga na tela**, entram em cima, sem repetir, e a marca
 *   do pedaco passa a valer.
 * - **Procurar traz as anteriores ate achar**, e o pedido do sino (a mencao) faz o mesmo.
 */

const dublê = vi.hoisted(() => ({ listar: vi.fn(), anterioresInternos: vi.fn() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: {
      listComments: dublê.listar,
      listOlderInternalComments: dublê.anterioresInternos,
      listOlderPublicComments: vi.fn(),
    },
  }
})

function interno(id: string, quando: string): InternalCommentViewModel {
  return {
    PublicId: id,
    AuthorName: 'Ana Dona',
    Body: `Mensagem ${id}`,
    CreatedAt: quando,
    EditedAt: null,
    IsYours: false,
  }
}

beforeEach(() => {
  dublê.listar.mockReset()
  dublê.anterioresInternos.mockReset()
  dublê.listar.mockResolvedValue({
    Internal: [interno('c-3', '2026-11-24T12:00:00Z'), interno('c-4', '2026-11-24T13:00:00Z')],
    Public: [],
    HasOlderInternal: true,
    HasOlderPublic: false,
  })
})

afterEach(() => vi.clearAllMocks())

describe('a conversa do card aos pedacos', () => {
  it('abre com as mais recentes e diz que ha anteriores', async () => {
    const { result } = renderHook(() => useReportComments('p-1', 'r-1'))
    await waitFor(() => expect(result.current.data).not.toBeNull())

    expect(dublê.listar).toHaveBeenCalledWith('p-1', 'r-1', { limit: COMMENTS_PAGE_SIZE })
    expect(result.current.temMais).toEqual({ Internal: true, Public: false })
  })

  it('as anteriores vem pela mais antiga na tela, entram em cima e sem repetir', async () => {
    dublê.anterioresInternos.mockResolvedValue({
      // A c-3 repetida (chegou na leitura e no pedaco) aparece uma vez so.
      Items: [interno('c-1', '2026-11-23T12:00:00Z'), interno('c-2', '2026-11-23T13:00:00Z')],
      HasOlder: false,
    })
    const { result } = renderHook(() => useReportComments('p-1', 'r-1'))
    await waitFor(() => expect(result.current.data).not.toBeNull())

    await act(() => result.current.carregarAnteriores('Internal'))

    expect(dublê.anterioresInternos).toHaveBeenCalledWith('p-1', 'r-1', 'c-3', COMMENTS_PAGE_SIZE)
    expect(result.current.data?.Internal.map((fala) => fala.PublicId)).toEqual([
      'c-1',
      'c-2',
      'c-3',
      'c-4',
    ])
    expect(result.current.temMais.Internal).toBe(false)
  })

  it('procurar traz as anteriores ate achar a mensagem', async () => {
    dublê.anterioresInternos
      .mockResolvedValueOnce({ Items: [interno('c-2', '2026-11-23T13:00:00Z')], HasOlder: true })
      .mockResolvedValueOnce({ Items: [interno('c-1', '2026-11-23T12:00:00Z')], HasOlder: false })
    const { result } = renderHook(() => useReportComments('p-1', 'r-1'))
    await waitFor(() => expect(result.current.data).not.toBeNull())

    let achou = false
    await act(async () => {
      achou = await result.current.procurar('Internal', 'c-1')
    })

    expect(achou).toBe(true)
    expect(dublê.anterioresInternos).toHaveBeenCalledTimes(2)
    expect(dublê.anterioresInternos.mock.calls[1]?.[2]).toBe('c-2')
  })

  it('o pedido do sino (a mencao) faz a conversa procurar a mensagem', async () => {
    dublê.anterioresInternos.mockResolvedValue({
      Items: [interno('c-1', '2026-11-23T12:00:00Z')],
      HasOlder: false,
    })
    const { result } = renderHook(() => useReportComments('p-1', 'r-1'))
    await waitFor(() => expect(result.current.data).not.toBeNull())

    act(() => {
      document.dispatchEvent(new CustomEvent(COMMENT_SEARCH_EVENT, { detail: 'c-1' }))
    })

    await waitFor(() =>
      expect(result.current.data?.Internal.some((fala) => fala.PublicId === 'c-1')).toBe(true),
    )
  })
})
