// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummaryViewModel } from '@/contracts'
import { NO_REPORT_FILTERS } from '@/data'
import { useReportInbox } from '@/features/reports/useReportInbox'

/**
 * O QUE ESTES TESTES TRAVAM: a lista relida pelo tempo real.
 *
 * - **Sem esvaziar**: enquanto rele, a tela continua com o que tinha.
 * - **Sem atropelar o que mudou aqui no meio** — o "Carregar mais", o card criado —: a
 *   lista e lida de novo, e o que chegou fica.
 * - **Duas releituras no ar, vale a ultima.**
 *
 * E a lista com os filtros, as colunas, a sprint e a ordem:
 *
 * - **O que a tela escolheu vai para a leitura** — os filtros (so com a chave), as
 *   colunas, a sprint e a ordem (L-01, L-07); sem nada disso, a leitura de sempre. O
 *   tamanho da pagina e da API (50): a lista nunca o manda.
 * - **Relendo por uma chave nova, a lista de antes fica, marcada como relendo** (L-09);
 *   outro recorte comeca do zero.
 * - **"loadAll" le so as paginas que faltam e devolve a lista inteira** (L-04), sem
 *   repetir o card que uma pagina empurrou para a seguinte; o recorte que mudou no meio
 *   devolve nulo, e a falha volta para quem chamou.
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

describe('a lista pelos filtros, colunas, sprint e ordem', () => {
  beforeEach(() => {
    dublê.listar.mockReset()
  })

  type Pagina = { reports: ReportSummaryViewModel[]; total: number }
  const ids = (lista: ReportSummaryViewModel[] | null) => lista?.map((r) => r.PublicId)

  it('as colunas, a sprint e a ordem vao para a leitura; sem nada disso, e a leitura de sempre', async () => {
    dublê.listar.mockResolvedValue({ reports: [card('1')], total: 1 })
    const filtros = { ...NO_REPORT_FILTERS, open: true }
    renderHook(() =>
      useReportInbox('p-1', null, false, true, filtros, 'chave', {
        columns: ['s-1', 'none'],
        sprint: 'backlog',
        sort: { field: 'due', dir: 'asc' },
      }),
    )
    await waitFor(() =>
      expect(dublê.listar).toHaveBeenCalledWith('p-1', 1, null, false, {
        filters: filtros,
        columns: ['s-1', 'none'],
        sprint: 'backlog',
        sort: { field: 'due', dir: 'asc' },
      }),
    )

    // Sem chave, os filtros nao vao — a busca que ainda espera a pessoa nao e filtro —;
    // so a ordem, e ela vai sozinha.
    dublê.listar.mockClear()
    renderHook(() =>
      useReportInbox('p-2', null, false, true, filtros, '', {
        columns: [],
        sort: { field: 'priority', dir: 'desc' },
      }),
    )
    await waitFor(() =>
      expect(dublê.listar).toHaveBeenCalledWith('p-2', 1, null, false, {
        sort: { field: 'priority', dir: 'desc' },
      }),
    )

    // Nada escolhido: a chamada de sempre, sem opcoes.
    dublê.listar.mockClear()
    renderHook(() => useReportInbox('p-3', null, false, true, NO_REPORT_FILTERS, '', {}))
    await waitFor(() => expect(dublê.listar).toHaveBeenCalledTimes(1))
    expect(dublê.listar.mock.calls[0]).toEqual(['p-3', 1, null, false])
  })

  it('a pagina e a da API, de 50: a lista nao manda o tamanho, e o "tem mais" sai do total', async () => {
    const cinquenta = (pagina: number) =>
      Array.from({ length: 50 }, (_, i) => card(`${pagina}-${i}`))
    dublê.listar.mockImplementation(async (_p: string, pagina: number) => ({
      reports: pagina < 3 ? cinquenta(pagina) : cinquenta(3).slice(0, 34),
      total: 134,
    }))
    const { result } = renderHook(() =>
      useReportInbox('p-1', null, false, true, NO_REPORT_FILTERS, 'chave', {
        sort: { field: 'due', dir: 'asc' },
      }),
    )
    await waitFor(() => expect(result.current.reports).toHaveLength(50))
    expect(result.current.total).toBe(134)
    expect(result.current.hasMore).toBe(true)

    await act(() => result.current.loadMore())
    expect(result.current.reports).toHaveLength(100)
    expect(result.current.hasMore).toBe(true)
    // Nenhuma leitura pede tamanho: quem decide a pagina e a API.
    expect(dublê.listar.mock.calls.every((chamada) => !('pageSize' in (chamada[4] ?? {})))).toBe(
      true,
    )
    expect(dublê.listar.mock.calls.map((chamada) => chamada[1])).toEqual([1, 2])
  })

  it('relendo por uma chave nova, a lista de antes fica na tela, marcada como relendo; outro recorte comeca do zero', async () => {
    dublê.listar.mockResolvedValueOnce({ reports: [card('1')], total: 1 })
    const { result, rerender } = renderHook(
      ({ chave, arquivados }) =>
        useReportInbox(
          'p-1',
          null,
          arquivados,
          true,
          { ...NO_REPORT_FILTERS, overdue: chave !== '' },
          chave,
        ),
      { initialProps: { chave: '', arquivados: false } },
    )
    await waitFor(() => expect(result.current.reports).toHaveLength(1))
    expect(result.current.refreshing).toBe(false)

    const lida = emVoo<Pagina>()
    dublê.listar.mockReturnValueOnce(lida.promessa)
    rerender({ chave: 'vencidos', arquivados: false })
    // A lista velha fica — e diz que esta sendo relida, para nao parecer o resultado.
    await waitFor(() => expect(result.current.refreshing).toBe(true))
    expect(ids(result.current.reports)).toEqual(['1'])
    expect(result.current.loading).toBe(false)
    expect(dublê.listar).toHaveBeenLastCalledWith('p-1', 1, null, false, {
      filters: { ...NO_REPORT_FILTERS, overdue: true },
    })

    await act(async () => lida.resolver({ reports: [card('2')], total: 1 }))
    expect(result.current.refreshing).toBe(false)
    expect(ids(result.current.reports)).toEqual(['2'])

    // Os arquivados sao outra lista: comeca vazia, carregando — e nao "relendo".
    const arquivados = emVoo<Pagina>()
    dublê.listar.mockReturnValueOnce(arquivados.promessa)
    rerender({ chave: 'vencidos', arquivados: true })
    await waitFor(() => expect(result.current.loading).toBe(true))
    expect(result.current.reports).toBeNull()
    expect(result.current.refreshing).toBe(false)
    await act(async () => arquivados.resolver({ reports: [card('9')], total: 1 }))
    expect(ids(result.current.reports)).toEqual(['9'])
  })

  it('"loadAll" le so as paginas que faltam, sem repetir o card que uma pagina empurrou, e devolve a lista inteira', async () => {
    // Entre a primeira pagina e as seguintes entrou um card no topo: a lista andou uma
    // posicao, e a pagina 2 traz de novo o ultimo da 1.
    const paginas: Record<number, Pagina> = {
      1: { reports: [card('1'), card('2')], total: 4 },
      2: { reports: [card('2'), card('3')], total: 5 },
      3: { reports: [card('4')], total: 5 },
    }
    dublê.listar.mockImplementation(
      async (_p: string, pagina: number) => paginas[pagina] ?? { reports: [], total: 5 },
    )
    const { result } = renderHook(() => useReportInbox('p-1', null))
    await waitFor(() => expect(result.current.reports).toHaveLength(2))

    let todos: ReportSummaryViewModel[] | null = null
    await act(async () => {
      todos = await result.current.loadAll()
    })
    expect(ids(todos)).toEqual(['1', '2', '3', '4'])
    expect(ids(result.current.reports)).toEqual(['1', '2', '3', '4'])
    expect(result.current.total).toBe(5)
    expect(result.current.loadingMore).toBe(false)
    expect(dublê.listar.mock.calls.map((chamada) => chamada[1])).toEqual([1, 2, 3])

    // Com tudo na tela, nada a ler.
    dublê.listar.mockClear()
    dublê.listar.mockResolvedValue({ reports: [card('1')], total: 1 })
    const outro = renderHook(() => useReportInbox('p-2', null))
    await waitFor(() => expect(outro.result.current.reports).toHaveLength(1))
    let so: ReportSummaryViewModel[] | null = null
    await act(async () => {
      so = await outro.result.current.loadAll()
    })
    expect(ids(so)).toEqual(['1'])
    expect(dublê.listar).toHaveBeenCalledTimes(1)
  })

  it('"loadAll" no meio de uma troca de recorte devolve nulo e nao mistura as listas; a falha volta para quem chamou', async () => {
    dublê.listar.mockResolvedValueOnce({ reports: [card('1')], total: 3 })
    const { result, rerender } = renderHook(
      ({ chave }) => useReportInbox('p-1', null, false, true, NO_REPORT_FILTERS, chave),
      { initialProps: { chave: '' } },
    )
    await waitFor(() => expect(result.current.reports).toHaveLength(1))

    const segunda = emVoo<Pagina>()
    dublê.listar.mockReturnValueOnce(segunda.promessa)
    let lendo: Promise<ReportSummaryViewModel[] | null> = Promise.resolve(null)
    act(() => {
      lendo = result.current.loadAll()
    })
    expect(result.current.loadingMore).toBe(true)

    // A pessoa trocou o filtro: a lista nova chega antes da pagina 2 da velha.
    dublê.listar.mockResolvedValueOnce({ reports: [card('7')], total: 1 })
    rerender({ chave: 'outra' })
    await waitFor(() => expect(ids(result.current.reports)).toEqual(['7']))

    let devolvida: ReportSummaryViewModel[] | null = []
    await act(async () => {
      segunda.resolver({ reports: [card('2'), card('3')], total: 3 })
      devolvida = await lendo
    })
    expect(devolvida).toBeNull()
    expect(ids(result.current.reports)).toEqual(['7'])
    expect(result.current.loadingMore).toBe(false)

    // A leitura que falha: o erro volta (a barra do lote o mostra), e a lista fica.
    dublê.listar.mockReset()
    dublê.listar.mockResolvedValueOnce({ reports: [card('7')], total: 2 })
    rerender({ chave: 'mais uma' })
    await waitFor(() => expect(result.current.total).toBe(2))
    dublê.listar.mockRejectedValueOnce(new Error('sem rede'))
    await act(async () => {
      await expect(result.current.loadAll()).rejects.toThrow('sem rede')
    })
    expect(ids(result.current.reports)).toEqual(['7'])
    expect(result.current.loadingMore).toBe(false)
  })
})
