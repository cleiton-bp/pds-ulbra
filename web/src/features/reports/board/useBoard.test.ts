// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummaryViewModel } from '@/contracts'
import { NO_REPORT_FILTERS, type ReportListOptions } from '@/data'
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
    Finished: false,
    Parent: null,
    SubtaskCount: 0,
    SubtasksDone: 0,
    BlockedBy: [],
    DuplicateOf: null,
    DuplicateReporters: 0,
    Sprint: null,
    StoryPoints: null,
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

describe('o que chega pelo tempo real', () => {
  beforeEach(() => {
    dublê.listar.mockReset()
  })

  const leiturasDe = (estado: string) =>
    dublê.listar.mock.calls.filter((chamada) => chamada[2] === estado).length
  const espera = (ms: number) => act(() => new Promise((pronto) => setTimeout(pronto, ms)))

  it('rele a coluna de onde o card saiu e a de onde ele esta, e avisos proximos viram uma leitura so', async () => {
    const { result } = await montado()
    const antes = { a: leiturasDe('a'), b: leiturasDe('b') }

    act(() => {
      result.current.remoteChange('1', 'b')
      result.current.remoteChange('1', 'b')
      result.current.remoteChange('4', 'b')
    })

    await waitFor(() => expect(leiturasDe('a')).toBe(antes.a + 1))
    expect(leiturasDe('b')).toBe(antes.b + 1)
  })

  it('o card que foi para o arquivo rele so a coluna de onde saiu; coluna que o quadro nao tem nao e lida', async () => {
    const { result } = await montado()
    const antes = { a: leiturasDe('a'), b: leiturasDe('b') }

    act(() => result.current.remoteChange('4', null))
    await waitFor(() => expect(leiturasDe('b')).toBe(antes.b + 1))
    expect(leiturasDe('a')).toBe(antes.a)

    // Coluna nova, que esta tela ainda nao tem: a contagem relida a traz pelo caminho
    // de sempre, e daqui nada e lido.
    act(() => result.current.remoteChange('desconhecido', 'nova'))
    await espera(400)
    expect(leiturasDe('nova')).toBe(0)
  })

  it('segurando — um arraste, um movimento gravando —, a releitura espera, e acontece ao soltar', async () => {
    const { result } = await montado()
    const antes = leiturasDe('a')

    let soltar = () => {}
    act(() => {
      soltar = result.current.hold()
      result.current.remoteChange('1', 'a')
    })
    await espera(400)
    expect(leiturasDe('a')).toBe(antes)

    act(() => soltar())
    await waitFor(() => expect(leiturasDe('a')).toBe(antes + 1))

    // Soltar de novo nao solta outra pessoa que esteja segurando.
    let outra = () => {}
    act(() => {
      outra = result.current.hold()
      soltar()
      result.current.remoteChange('1', 'a')
    })
    await espera(400)
    expect(leiturasDe('a')).toBe(antes + 1)
    act(() => outra())
    await waitFor(() => expect(leiturasDe('a')).toBe(antes + 2))
  })

  it('reler tudo — a configuracao mudou, ou a conexao voltou — le cada coluna uma vez', async () => {
    const { result } = await montado()
    const antes = { a: leiturasDe('a'), b: leiturasDe('b') }

    act(() => {
      result.current.reloadAll()
      result.current.remoteChange('1', 'a')
    })

    await waitFor(() => expect(leiturasDe('b')).toBe(antes.b + 1))
    expect(leiturasDe('a')).toBe(antes.a + 1)
  })

  it('a leitura que estava no ar quando a ordem mudou aqui nao passa por cima: a coluna e lida de novo', async () => {
    const { result } = await montado()

    // A releitura demora, e traz a coluna de antes do card criado.
    let soltarVelha: () => void = () => {}
    dublê.listar.mockImplementationOnce(
      () =>
        new Promise((pronto) => {
          soltarVelha = () => pronto({ reports: [card('4', 'b')], total: 1 })
        }),
    )
    act(() => result.current.remoteChange('4', 'b'))
    await waitFor(() => expect(leiturasDe('b')).toBe(2))

    act(() => result.current.insert(card('9', 'b')))
    dublê.listar.mockResolvedValue({ reports: [card('9', 'b'), card('4', 'b')], total: 2 })
    await act(async () => soltarVelha())

    expect(result.current.items.b).toEqual(['9', '4'])
    await waitFor(() => expect(leiturasDe('b')).toBe(3))
    expect(result.current.items.b).toEqual(['9', '4'])
  })

  it('a coluna aberta alem do teto da API e relida inteira, em mais de um pedido', async () => {
    const muitos = (de: number, ate: number) =>
      Array.from({ length: ate - de }, (_, i) => card(`m${de + i}`, 'a'))
    const { result } = await montado()
    act(() =>
      result.current.setItems((todos) => ({ ...todos, a: muitos(0, 130).map((c) => c.PublicId) })),
    )

    dublê.listar.mockImplementation(
      async (_p: string, _pg: number, _e: string, _a: boolean, opcoes?: ReportListOptions) =>
        opcoes?.after === 'm99'
          ? { reports: muitos(100, 130), total: 130 }
          : { reports: muitos(0, 100), total: 130 },
    )
    const antes = leiturasDe('a')
    await act(() => result.current.reloadColumn('a'))

    const pedidos = dublê.listar.mock.calls.slice(-2).map((chamada) => chamada[4])
    expect(leiturasDe('a')).toBe(antes + 2)
    expect(pedidos).toEqual([
      { order: 'board', pageSize: 100 },
      { order: 'board', pageSize: 30, after: 'm99' },
    ])
    expect(result.current.items.a).toHaveLength(130)
  })

  it('a coluna vazia ja lida nao vira esqueleto ao ser relida', async () => {
    dublê.listar.mockImplementation(async (_p: string, _pg: number, estado: string) =>
      estado === 'a' ? { reports: [card('1', 'a')], total: 1 } : { reports: [], total: 0 },
    )
    const { result } = renderHook(() => useBoard('p-1', COLUNAS, true))
    await waitFor(() => expect(result.current.items).toEqual({ a: ['1'], b: [] }))

    dublê.listar.mockImplementation(() => new Promise(() => {}))
    act(() => {
      void result.current.reloadColumn('b')
    })
    expect(result.current.state.b?.loading).toBe(false)
  })

  it('o card do aviso acende quando a coluna dele foi relida — e nao enquanto a mao segura', async () => {
    const aoReler = vi.fn()
    dublê.listar.mockImplementation(async (_p: string, _pg: number, estado: string) =>
      estado === 'a'
        ? { reports: [card('1', 'a', { Number: 41 })], total: 1 }
        : { reports: [card('4', 'b', { Number: 44 })], total: 1 },
    )
    const { result } = renderHook(() => useBoard('p-1', COLUNAS, true, aoReler))
    await waitFor(() => expect(result.current.items).toEqual({ a: ['1'], b: ['4'] }))

    let soltar = () => {}
    act(() => {
      soltar = result.current.hold()
      result.current.remoteChange('1', 'b')
    })
    await espera(400)
    expect(aoReler).not.toHaveBeenCalled()

    // Solta; a releitura demora: ainda nada aceso.
    const respostas: (() => void)[] = []
    dublê.listar.mockImplementation(
      async (_p: string, _pg: number, estado: string) =>
        new Promise((pronto) => {
          respostas.push(() =>
            pronto(
              estado === 'a'
                ? { reports: [], total: 0 }
                : {
                    reports: [card('1', 'b', { Number: 41 }), card('4', 'b', { Number: 44 })],
                    total: 2,
                  },
            ),
          )
        }),
    )
    act(() => soltar())
    await waitFor(() => expect(respostas).toHaveLength(2))
    await espera(50)
    expect(aoReler).not.toHaveBeenCalled()

    await act(async () => {
      for (const responder of respostas) responder()
    })
    await waitFor(() => expect(aoReler).toHaveBeenCalledWith([{ id: '1', numero: 41 }]))
    expect(aoReler).toHaveBeenCalledTimes(1)
    expect(result.current.items).toEqual({ a: [], b: ['1', '4'] })
  })

  it('o filtro novo rele cada coluna aberta do comeco, com ele — sem esvaziar a tela', async () => {
    dublê.listar.mockImplementation(async (_p: string, _pg: number, estado: string) =>
      estado === 'a'
        ? { reports: [card('1', 'a')], total: 1 }
        : { reports: [card('4', 'b')], total: 1 },
    )
    const filtros = { ...NO_REPORT_FILTERS, assignees: ['me'] }
    const { result, rerender } = renderHook(
      ({ chave }) => useBoard('p-1', COLUNAS, true, undefined, filtros, chave),
      { initialProps: { chave: '' } },
    )
    await waitFor(() => expect(result.current.items).toEqual({ a: ['1'], b: ['4'] }))
    expect(dublê.listar.mock.calls.every((chamada) => !chamada[4]?.filters)).toBe(true)

    dublê.listar.mockImplementation(() => new Promise(() => {}))
    const antes = dublê.listar.mock.calls.length
    rerender({ chave: 'so-os-meus' })

    await waitFor(() => expect(dublê.listar.mock.calls.length).toBe(antes + 2))
    for (const chamada of dublê.listar.mock.calls.slice(antes))
      expect(chamada[4]).toEqual({ order: 'board', pageSize: 50, filters: filtros })
    // Enquanto le, os cards de antes continuam.
    expect(result.current.items).toEqual({ a: ['1'], b: ['4'] })
    expect(result.current.state.a?.loading).toBe(false)
  })

  it('de duas leituras da mesma coluna no ar, so a ultima pedida vale', async () => {
    const { result } = await montado()

    let soltarPrimeira: () => void = () => {}
    dublê.listar
      .mockImplementationOnce(
        () =>
          new Promise((pronto) => {
            soltarPrimeira = () => pronto({ reports: [card('velho', 'b')], total: 1 })
          }),
      )
      .mockResolvedValueOnce({ reports: [card('novo', 'b')], total: 1 })

    act(() => {
      void result.current.reloadColumn('b')
      void result.current.reloadColumn('b')
    })
    await waitFor(() => expect(result.current.items.b).toEqual(['novo']))
    await act(async () => soltarPrimeira())
    expect(result.current.items.b).toEqual(['novo'])
  })
})
