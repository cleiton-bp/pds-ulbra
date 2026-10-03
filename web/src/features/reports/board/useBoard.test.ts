// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummaryViewModel } from '@/contracts'
import type { ReportListOptions } from '@/data'
import { PanelError } from '@/data/errors'
import type { BoardColumn } from '@/features/reports/board/boardState'
import { useBoard } from '@/features/reports/board/useBoard'

/**
 * O QUE ESTES TESTES TRAVAM: o quadro em dia com o que muda, sem ler tudo de novo.
 *
 * - **Uma leitura por coluna, na ordem do quadro, 50 de cada vez** — e nada enquanto a
 *   vista nao e o quadro; ao voltar a ela, tudo de novo.
 * - **"Mostrar mais" pede o que vem depois do ultimo card da tela**, e nao a pagina
 *   seguinte: o card que sai de cima mexe nas paginas, e a seguinte pularia um. O card
 *   de referencia que ja saiu da coluna faz a coluna ser lida de novo. **No fim da
 *   coluna, o botao some**, mesmo que o total diga mais.
 * - **Reler a coluna traz tudo o que ja estava aberto nela**, sem tirar os cards da
 *   tela enquanto le.
 * - **O conjunto de colunas muda**: so a nova e lida, a que saiu sai. **Outro projeto**:
 *   tudo de novo.
 * - **A mudanca do dialogo**: o card que trocou de coluna vai para o topo da nova (e
 *   onde a API o pos), o arquivado sai, e os totais acompanham.
 * - **O card novo entra no topo da coluna dele.**
 */
const dublê = vi.hoisted(() => ({ listar: vi.fn() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return { ...real, projectReportService: { listReports: dublê.listar } }
})

const coluna = (key: string): BoardColumn => ({
  key,
  name: key,
  accepts: true,
  retired: false,
  closes: false,
  last: false,
  total: 0,
})
const COLUNAS = [coluna('a'), coluna('b')]

function card(
  id: string,
  estado: string,
  extra: Partial<ReportSummaryViewModel> = {},
): ReportSummaryViewModel {
  return {
    PublicId: id,
    Kind: 'Team',
    Number: 1,
    Title: `Card ${id}`,
    ReporterTitle: null,
    TrackingCode: null,
    Type: null,
    Text: null,
    Route: null,
    Origin: null,
    StatePublicId: estado,
    StateName: estado,
    PublicStageLabel: null,
    AcceptsQuestions: null,
    PublicStageDueAt: null,
    ArchivedAt: null,
    CreatedAt: '2026-10-03T12:00:00.000Z',
    Assignee: null,
    Priority: null,
    Labels: [],
    DueDate: null,
    CommentCount: 0,
    AttachmentCount: 0,
    Closed: false,
    ...extra,
  }
}

/** A coluna "a" com tres cards, 2 de cada vez; a "b" com um. Depois do ultimo, os seguintes. */
async function montado() {
  dublê.listar.mockImplementation(
    async (
      _p: string,
      _pagina: number,
      estado: string,
      _a: boolean,
      opcoes?: ReportListOptions,
    ) => {
      if (estado === 'a') {
        return opcoes?.after
          ? { reports: [card('2', 'a'), card('3', 'a')], total: 3 }
          : { reports: [card('1', 'a'), card('2', 'a')], total: 3 }
      }
      return { reports: [card('4', 'b')], total: 1 }
    },
  )
  const hook = renderHook(({ projeto, colunas, ligado }) => useBoard(projeto, colunas, ligado), {
    initialProps: { projeto: 'p-1', colunas: COLUNAS, ligado: true },
  })
  await waitFor(() => expect(hook.result.current.items).toEqual({ a: ['1', '2'], b: ['4'] }))
  return hook
}

describe('o quadro carregado coluna por coluna', () => {
  // Entre chaves: devolvido, o dublê viraria a limpeza do teste — o vitest o chamaria
  // no fim, e a promessa que nunca responde seguraria o teste.
  beforeEach(() => {
    dublê.listar.mockReset()
  })

  it('uma leitura por coluna, na ordem do quadro, 50 de cada vez — nada fora da vista do quadro, e tudo de novo ao voltar', async () => {
    const { result, rerender } = await montado()

    expect(dublê.listar).toHaveBeenCalledWith('p-1', 1, 'a', false, {
      order: 'board',
      pageSize: 50,
    })
    expect(dublê.listar).toHaveBeenCalledWith('p-1', 1, 'b', false, {
      order: 'board',
      pageSize: 50,
    })
    expect(result.current.state.a?.total).toBe(3)

    dublê.listar.mockClear()
    rerender({ projeto: 'p-1', colunas: COLUNAS, ligado: false })
    expect(dublê.listar).not.toHaveBeenCalled()

    rerender({ projeto: 'p-1', colunas: COLUNAS, ligado: true })
    await waitFor(() => expect(dublê.listar).toHaveBeenCalledTimes(2))
  })

  it('"Mostrar mais" pede o que vem depois do ultimo card da tela, e soma sem repetir', async () => {
    const { result } = await montado()

    await act(() => result.current.loadMore('a'))
    expect(result.current.items.a).toEqual(['1', '2', '3'])
    expect(dublê.listar).toHaveBeenLastCalledWith('p-1', 1, 'a', false, {
      order: 'board',
      pageSize: 50,
      after: '2',
    })
  })

  it('o ultimo card da tela ja saiu da coluna: a coluna e lida de novo, sem erro na tela', async () => {
    const { result } = await montado()
    dublê.listar.mockImplementation(
      async (_p: string, _pagina: number, _e: string, _a: boolean, opcoes?: ReportListOptions) => {
        if (opcoes?.after) throw new PanelError('O card de referencia saiu da coluna.', 409)
        return { reports: [card('1', 'a'), card('3', 'a')], total: 2 }
      },
    )

    await act(() => result.current.loadMore('a'))
    expect(result.current.items.a).toEqual(['1', '3'])
    expect(result.current.state.a?.failed).toBe(false)
  })

  it('no fim da coluna, nao ha mais o que mostrar — mesmo que o total diga mais', async () => {
    const cheia = Array.from({ length: 50 }, (_, i) => card(`c${i}`, 'a'))
    dublê.listar.mockImplementation(
      async (
        _p: string,
        _pagina: number,
        estado: string,
        _a: boolean,
        opcoes?: ReportListOptions,
      ) =>
        estado === 'a'
          ? opcoes?.after
            ? { reports: [card('ultimo', 'a')], total: 52 }
            : { reports: cheia, total: 51 }
          : { reports: [], total: 0 },
    )
    const { result } = renderHook(() => useBoard('p-1', COLUNAS, true))
    await waitFor(() => expect(result.current.items.a?.length).toBe(50))
    expect(result.current.state.a?.end).toBe(false)
    expect(result.current.state.b?.end).toBe(true)

    // Veio 1 de 50: acabou — e o total, que agora diz 52, nao segura o botao.
    await act(() => result.current.loadMore('a'))
    expect(result.current.state.a?.end).toBe(true)
  })

  it('reler a coluna traz tudo o que ja estava aberto nela, e nao tira os cards da tela enquanto le', async () => {
    const muitos = (de: number, ate: number) =>
      Array.from({ length: ate - de }, (_, i) => card(`m${de + i}`, 'a'))
    dublê.listar.mockImplementation(
      async (
        _p: string,
        _pagina: number,
        estado: string,
        _a: boolean,
        opcoes?: ReportListOptions,
      ) =>
        estado === 'a'
          ? { reports: opcoes?.after ? muitos(50, 60) : muitos(0, 50), total: 60 }
          : { reports: [], total: 0 },
    )
    const { result } = renderHook(() => useBoard('p-1', COLUNAS, true))
    await waitFor(() => expect(result.current.items.a?.length).toBe(50))
    await act(() => result.current.loadMore('a'))
    expect(result.current.items.a?.length).toBe(60)

    let responder: (valor: unknown) => void = () => {}
    dublê.listar.mockImplementation(
      () =>
        new Promise((resolve) => {
          responder = resolve
        }),
    )
    let relendo: Promise<void> = Promise.resolve()
    act(() => {
      relendo = result.current.reloadColumn('a')
    })
    expect(dublê.listar).toHaveBeenLastCalledWith('p-1', 1, 'a', false, {
      order: 'board',
      pageSize: 60,
    })
    // Enquanto le, a coluna continua com os cards — sem esqueleto no lugar.
    expect(result.current.state.a?.loading).toBe(false)
    expect(result.current.items.a?.length).toBe(60)

    await act(async () => {
      responder({ reports: muitos(0, 60), total: 60 })
      await relendo
    })
    expect(result.current.items.a?.length).toBe(60)
  })

  it('o conjunto de colunas muda: so a nova e lida, e a que saiu sai; outro projeto, tudo de novo', async () => {
    const { result, rerender } = await montado()
    dublê.listar.mockClear()
    dublê.listar.mockImplementation(async (_p: string, _pagina: number, estado: string) => ({
      reports: [card(`novo-${estado}`, estado)],
      total: 1,
    }))

    rerender({ projeto: 'p-1', colunas: [coluna('none'), ...COLUNAS], ligado: true })
    await waitFor(() => expect(result.current.items.none).toEqual(['novo-none']))
    expect(dublê.listar).toHaveBeenCalledTimes(1)
    expect(result.current.items.a).toEqual(['1', '2'])

    rerender({ projeto: 'p-1', colunas: COLUNAS, ligado: true })
    await waitFor(() => expect(result.current.items.none).toBeUndefined())
    expect(dublê.listar).toHaveBeenCalledTimes(1)

    rerender({ projeto: 'p-2', colunas: COLUNAS, ligado: true })
    await waitFor(() => expect(result.current.items).toEqual({ a: ['novo-a'], b: ['novo-b'] }))
    expect(dublê.listar).toHaveBeenCalledWith('p-2', 1, 'a', false, {
      order: 'board',
      pageSize: 50,
    })
  })

  it('a mudanca do dialogo: trocou de coluna vai para o topo da nova; arquivado sai; os totais acompanham', async () => {
    const { result } = await montado()

    act(() => result.current.apply(card('1', 'b', { Title: 'Renomeado' })))
    expect(result.current.items).toEqual({ a: ['2'], b: ['1', '4'] })
    expect(result.current.cards['1']?.Title).toBe('Renomeado')
    expect(result.current.state.a?.total).toBe(2)
    expect(result.current.state.b?.total).toBe(2)

    act(() => result.current.apply(card('4', 'b', { ArchivedAt: '2026-10-03T13:00:00.000Z' })))
    expect(result.current.items.b).toEqual(['1'])
    expect(result.current.state.b?.total).toBe(1)

    // Responder ao quem soltou troca so os dados: o lugar ja esta certo na tela.
    act(() => result.current.update(card('2', 'a', { CommentCount: 3 })))
    expect(result.current.items.a).toEqual(['2'])
    expect(result.current.cards['2']?.CommentCount).toBe(3)
  })

  it('o card novo entra no topo da coluna dele', async () => {
    const { result } = await montado()

    act(() => result.current.insert(card('9', 'b')))
    expect(result.current.items.b).toEqual(['9', '4'])
    expect(result.current.state.b?.total).toBe(2)
  })
})
