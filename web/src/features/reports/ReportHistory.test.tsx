// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportHistoryEntryViewModel } from '@/contracts'
import { ReportHistory } from '@/features/reports/ReportHistory'

/**
 * O QUE ESTES TESTES TRAVAM: a linha do tempo do card aberto, so com o que e acao.
 *
 * - **O mais recente primeiro**, e a tela diz a ordem.
 * - **Do time, so a primeira abertura**, como "Aberto pela primeira vez pelo time" — e o
 *   tempo que o time levou para olhar.
 * - **A leitura de quem relatou tem frase propria**, e nunca passa pela do time, mesmo
 *   vindo antes: a primeira vez que abriu o acompanhamento, e as voltas so a pedido, em
 *   "Mostrar as voltas de quem relatou (N)".
 * - **O "nao andou" entra na linha do movimento** que o causou: "· quem relatou continua
 *   vendo a mesma etapa". Longe de um movimento, ele fica como linha propria.
 * - **As 10 mais recentes**, com "Mostrar tudo (N)".
 * - **O historico que falha tenta de novo.**
 */
const dublê = vi.hoisted(() => ({ historico: vi.fn() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: {
      listReportHistory: dublê.historico,
      listReportHistoryPage: async (
        publicId: string,
        reportPublicId: string,
        opcoes?: { before?: string; limit?: number; returns?: boolean },
      ) => {
        // O historico aos pedacos sai da lista inteira do dublê (o vi.mock roda antes dos imports).
        const { pedacoDoHistorico } = await import('@/test/historicoEmPedacos')
        return pedacoDoHistorico(await dublê.historico(publicId, reportPublicId), opcoes)
      },
    },
  }
})

let contador = 0
/** Uma linha da API, na ordem em que aconteceu: `minuto` depois das 10h. */
function linha(
  Type: ReportHistoryEntryViewModel['Type'],
  minuto: number,
  extra: Partial<ReportHistoryEntryViewModel> = {},
): ReportHistoryEntryViewModel {
  contador += 1
  return {
    PublicId: `h-${contador}`,
    Type,
    Source: 'Panel',
    AuthorName: 'Ana Dona',
    FromStateName: null,
    ToStateName: null,
    OccurredAt: new Date(Date.UTC(2026, 9, 7, 13, minuto, 0)).toISOString(),
    From: null,
    To: null,
    Added: [],
    Removed: [],
    TitleRestored: null,
    ...extra,
  }
}

/** As frases na tela, de cima para baixo. */
/** As frases das linhas, de todos os dias, da mais nova para a mais antiga. */
async function frases(): Promise<string[]> {
  await screen.findAllByRole('list')
  return screen.getAllByRole('listitem').map((item) => item.querySelector('p')?.textContent ?? '')
}

/** O card com o historico, ja aberto: ele vem fechado, e so le ao abrir. */
function montar() {
  const tela = render(<ReportHistory projectPublicId="p-1" reportPublicId="r-1" versao={0} />)
  abrir()
  return tela
}

const abrir = () => fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))

beforeEach(() => {
  dublê.historico.mockReset()
})

afterEach(cleanup)

describe('o historico do card aberto', () => {
  it('o mais recente primeiro; quem relatou nao vira o time, e as voltas dela so a pedido', async () => {
    const quemRelatou = { AuthorName: null, Source: 'PublicPage' } as const
    dublê.historico.mockResolvedValue([
      linha('ReportCreated', 0, { AuthorName: null, Source: 'Widget' }),
      // Quem relatou abre o acompanhamento antes de o time abrir o card.
      linha('ReportViewed', 1, quemRelatou),
      linha('ReportViewed', 5, { AuthorName: null }),
      linha('ReportStateChanged', 7, { FromStateName: 'A fazer', ToStateName: 'Fazendo' }),
      linha('ReportViewed', 8, quemRelatou),
      linha('ReportViewed', 9, quemRelatou),
    ])
    montar()

    expect(await frases()).toEqual([
      'Ana Dona moveu de A fazer para Fazendo',
      'O time abriu o relato pela primeira vez',
      'Quem relatou abriu o acompanhamento',
      'Relato recebido',
    ])
    expect(screen.getByText('Tudo o que aconteceu, do mais recente ao mais antigo')).toBeTruthy()
    // Os fatos do mesmo dia ficam juntos, debaixo do nome do dia.
    expect(screen.getByRole('heading', { name: '7 de outubro' })).toBeTruthy()
    expect(screen.queryByText('Alguém do time abriu')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar as voltas de quem relatou (2)' }))
    expect(await frases()).toEqual([
      'Quem relatou voltou ao acompanhamento',
      'Quem relatou voltou ao acompanhamento',
      'Ana Dona moveu de A fazer para Fazendo',
      'O time abriu o relato pela primeira vez',
      'Quem relatou abriu o acompanhamento',
      'Relato recebido',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Esconder as voltas de quem relatou' }))
    expect(await frases()).toHaveLength(4)
  })

  it('do time, uma abertura so, mesmo duas pessoas abrindo juntas —, e sem voltas a mostrar', async () => {
    dublê.historico.mockResolvedValue([
      linha('ReportCreated', 0),
      linha('ReportViewed', 1),
      linha('ReportViewed', 1),
      linha('ReportViewed', 2, { AuthorName: null, Source: 'PublicPage' }),
    ])
    montar()
    expect(await frases()).toEqual([
      'Quem relatou abriu o acompanhamento',
      'Ana Dona abriu o relato pela primeira vez',
      'Relato recebido',
    ])
    expect(screen.queryByRole('button', { name: /voltas de quem relatou/ })).toBeNull()
  })

  it('o "nao andou" vai na linha do movimento; longe de um movimento, fica sozinho', async () => {
    dublê.historico.mockResolvedValue([
      linha('ReportStateChanged', 0, { FromStateName: 'Análise', ToStateName: 'Fazendo' }),
      linha('ReportPublicStageUnmapped', 0, { AuthorName: null }),
      linha('ReportPublicStageUnmapped', 30, { AuthorName: null }),
    ])
    montar()

    expect(await frases()).toEqual([
      'Quem relatou continua vendo a mesma etapa',
      'Ana Dona moveu de Análise para Fazendo, e quem relatou continua vendo a mesma etapa',
    ])
    expect(screen.queryByText(/jornada/)).toBeNull()
  })

  it('le os 10 mais recentes; "Mostrar mais" traz os de antes, aos poucos', async () => {
    dublê.historico.mockResolvedValue(
      Array.from({ length: 12 }, (_, indice) =>
        linha('CardPriorityChanged', indice, { To: `P${indice + 1}` }),
      ),
    )
    montar()

    const dez = await frases()
    expect(dez).toHaveLength(10)
    expect(dez[0]).toBe('Ana Dona mudou a prioridade para P12')
    expect(dez[9]).toBe('Ana Dona mudou a prioridade para P3')
    expect(dublê.historico).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar mais (2)' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(12))
    expect((await frases())[11]).toBe('Ana Dona mudou a prioridade para P1')
    expect(screen.queryByRole('button', { name: /Mostrar mais/ })).toBeNull()
  })

  it('fechado, nao le nada; ao abrir, mostra que esta carregando e le', async () => {
    let entregar: (lista: ReportHistoryEntryViewModel[]) => void = () => {}
    dublê.historico.mockReturnValue(
      new Promise<ReportHistoryEntryViewModel[]>((resolve) => {
        entregar = resolve
      }),
    )
    const { rerender } = render(
      <ReportHistory projectPublicId="p-1" reportPublicId="r-1" versao={0} />,
    )
    // Algo acontece com o historico fechado: continua sem ler.
    rerender(<ReportHistory projectPublicId="p-1" reportPublicId="r-1" versao={1} />)
    expect(dublê.historico).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Histórico' }).getAttribute('aria-expanded')).toBe(
      'false',
    )

    abrir()
    expect(screen.getByRole('status').textContent).toContain('Carregando o histórico')
    await act(async () => entregar([linha('ReportCreated', 0)]))
    expect(await frases()).toEqual(['Relato recebido'])
    expect(dublê.historico).toHaveBeenCalledTimes(1)
  })

  it('aberto, o que chega depois entra em cima sem recomecar a lista', async () => {
    const primeiras = [linha('ReportCreated', 0)]
    dublê.historico.mockResolvedValue(primeiras)
    const { rerender } = montar()
    expect(await frases()).toEqual(['Relato recebido'])

    dublê.historico.mockResolvedValue([
      ...primeiras,
      linha('ReportStateChanged', 3, { FromStateName: 'A fazer', ToStateName: 'Fazendo' }),
    ])
    rerender(<ReportHistory projectPublicId="p-1" reportPublicId="r-1" versao={1} />)
    await waitFor(() =>
      expect(screen.getAllByRole('listitem')[0]?.textContent).toContain(
        'Ana Dona moveu de A fazer para Fazendo',
      ),
    )
    expect(await frases()).toHaveLength(2)
  })

  it('o historico que falha diz que o resto do card esta inteiro, e tenta de novo', async () => {
    dublê.historico
      .mockRejectedValueOnce(new Error('sem rede'))
      .mockResolvedValue([linha('ReportCreated', 0)])
    montar()

    expect(await screen.findByText(/O histórico não carregou/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await frases()).toEqual(['Relato recebido'])
    expect(dublê.historico).toHaveBeenCalledTimes(2)
  })
})
