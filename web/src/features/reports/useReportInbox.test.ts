// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummaryViewModel } from '@/contracts'
import { useReportInbox } from '@/features/reports/useReportInbox'

/**
 * O QUE ESTES TESTES TRAVAM: a lista relida pelo tempo real.
 *
 * - **Sem esvaziar**: enquanto rele, a tela continua com o que tinha.
 * - **Sem atropelar o que mudou aqui no meio** — o "Carregar mais", o card criado —: a
 *   lista e lida de novo, e o que chegou fica.
 * - **Duas releituras no ar, vale a ultima.**
 */
const dublê = vi.hoisted(() => ({ listar: vi.fn() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return { ...real, projectReportService: { listReports: dublê.listar } }
})

const card = (id: string): ReportSummaryViewModel =>
  ({
    PublicId: id,
    Title: `Card ${id}`,
    ArchivedAt: null,
    StatePublicId: 's-1',
  }) as ReportSummaryViewModel

/** Uma promessa que so resolve quando o teste mandar. */
function emVoo<T>() {
  let resolver: (valor: T) => void = () => {}
  const promessa = new Promise<T>((pronto) => {
    resolver = pronto
  })
  return { promessa, resolver }
}

describe('a lista relida pelo tempo real', () => {
  beforeEach(() => {
    dublê.listar.mockReset()
  })

  it('enquanto rele, a tela continua com o que tinha; depois, mostra o novo', async () => {
    dublê.listar.mockResolvedValueOnce({ reports: [card('1')], total: 1 })
    const { result } = renderHook(() => useReportInbox('p-1'))
    await waitFor(() => expect(result.current.reports).toHaveLength(1))

    const lida = emVoo<{ reports: ReportSummaryViewModel[]; total: number }>()
    dublê.listar.mockReturnValueOnce(lida.promessa)
    let relendo: Promise<unknown> = Promise.resolve()
    act(() => {
      relendo = result.current.refresh()
    })
    expect(result.current.reports?.map((r) => r.PublicId)).toEqual(['1'])
    expect(result.current.loading).toBe(false)

    await act(async () => {
      lida.resolver({ reports: [card('9'), card('1')], total: 2 })
      await relendo
    })
    expect(result.current.reports?.map((r) => r.PublicId)).toEqual(['9', '1'])
  })

  it('a pagina que o "Carregar mais" trouxe no meio da releitura nao some', async () => {
    dublê.listar.mockResolvedValueOnce({ reports: [card('1')], total: 2 })
    const { result } = renderHook(() => useReportInbox('p-1'))
    await waitFor(() => expect(result.current.reports).toHaveLength(1))

    const lida = emVoo<{ reports: ReportSummaryViewModel[]; total: number }>()
    dublê.listar.mockReturnValueOnce(lida.promessa)
    let relendo: Promise<unknown> = Promise.resolve()
    act(() => {
      relendo = result.current.refresh()
    })

    dublê.listar.mockResolvedValueOnce({ reports: [card('2')], total: 2 })
    await act(() => result.current.loadMore())
    expect(result.current.reports?.map((r) => r.PublicId)).toEqual(['1', '2'])

    // A releitura volta com uma pagina so: e lida de novo, agora com as duas.
    dublê.listar
      .mockResolvedValueOnce({ reports: [card('1')], total: 2 })
      .mockResolvedValueOnce({ reports: [card('2')], total: 2 })
    await act(async () => {
      lida.resolver({ reports: [card('1')], total: 2 })
      await relendo
    })
    expect(result.current.reports?.map((r) => r.PublicId)).toEqual(['1', '2'])
    expect(dublê.listar).toHaveBeenCalledTimes(5)
  })

  it('o card criado aqui no meio da releitura nao some', async () => {
    dublê.listar.mockResolvedValueOnce({ reports: [card('1')], total: 1 })
    const { result } = renderHook(() => useReportInbox('p-1'))
    await waitFor(() => expect(result.current.reports).toHaveLength(1))

    const lida = emVoo<{ reports: ReportSummaryViewModel[]; total: number }>()
    dublê.listar.mockReturnValueOnce(lida.promessa)
    let relendo: Promise<unknown> = Promise.resolve()
    act(() => {
      relendo = result.current.refresh()
    })
    act(() => result.current.prepend(card('novo')))

    dublê.listar.mockResolvedValueOnce({ reports: [card('novo'), card('1')], total: 2 })
    await act(async () => {
      lida.resolver({ reports: [card('1')], total: 1 })
      await relendo
    })
    expect(result.current.reports?.map((r) => r.PublicId)).toEqual(['novo', '1'])
  })

  it('duas releituras no ar: vale a ultima pedida, mesmo que a primeira chegue depois', async () => {
    dublê.listar.mockResolvedValueOnce({ reports: [card('1')], total: 1 })
    const { result } = renderHook(() => useReportInbox('p-1'))
    await waitFor(() => expect(result.current.reports).toHaveLength(1))

    const primeira = emVoo<{ reports: ReportSummaryViewModel[]; total: number }>()
    dublê.listar
      .mockReturnValueOnce(primeira.promessa)
      .mockResolvedValueOnce({ reports: [card('novo'), card('1')], total: 2 })
    await act(async () => {
      void result.current.refresh()
      await result.current.refresh()
    })
    expect(result.current.reports?.map((r) => r.PublicId)).toEqual(['novo', '1'])

    await act(async () => primeira.resolver({ reports: [card('1')], total: 1 }))
    expect(result.current.reports?.map((r) => r.PublicId)).toEqual(['novo', '1'])
  })
})
