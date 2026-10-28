// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
  return { ...real, projectReportService: { listReportHistory: dublê.historico } }
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
async function frases(): Promise<string[]> {
  const lista = await screen.findByRole('list')
  return within(lista)
    .getAllByRole('listitem')
    .map((item) => item.firstElementChild?.textContent ?? '')
}

function montar() {
  render(<ReportHistory projectPublicId="p-1" reportPublicId="r-1" versao={0} />)
}

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
      'Movido de A fazer para Fazendo',
      'Aberto pela primeira vez pelo time',
      'Quem relatou abriu o acompanhamento',
      'Relato recebido',
    ])
    expect(screen.getByText('Do mais recente para o mais antigo')).toBeTruthy()
    expect(screen.queryByText('Alguém do time abriu')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar as voltas de quem relatou (2)' }))
    expect(await frases()).toEqual([
      'Quem relatou voltou ao acompanhamento',
      'Quem relatou voltou ao acompanhamento',
      'Movido de A fazer para Fazendo',
      'Aberto pela primeira vez pelo time',
      'Quem relatou abriu o acompanhamento',
      'Relato recebido',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Esconder as voltas de quem relatou' }))
    expect(await frases()).toHaveLength(4)
  })

  it('do time, uma abertura so — mesmo duas pessoas abrindo juntas —, e sem voltas a mostrar', async () => {
    dublê.historico.mockResolvedValue([
      linha('ReportCreated', 0),
      linha('ReportViewed', 1),
      linha('ReportViewed', 1),
      linha('ReportViewed', 2, { AuthorName: null, Source: 'PublicPage' }),
    ])
    montar()
    expect(await frases()).toEqual([
      'Quem relatou abriu o acompanhamento',
      'Aberto pela primeira vez pelo time',
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
      'Movido de Análise para Fazendo · quem relatou continua vendo a mesma etapa',
    ])
    expect(screen.queryByText(/jornada/)).toBeNull()
  })

  it('as 10 mais recentes, com "Mostrar tudo"', async () => {
    dublê.historico.mockResolvedValue(
      Array.from({ length: 12 }, (_, indice) =>
        linha('CardPriorityChanged', indice, { To: `P${indice + 1}` }),
      ),
    )
    montar()

    const dez = await frases()
    expect(dez).toHaveLength(10)
    expect(dez[0]).toBe('Prioridade: P12')
    expect(dez[9]).toBe('Prioridade: P3')

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar tudo (12)' }))
    const todas = await frases()
    expect(todas).toHaveLength(12)
    expect(todas[11]).toBe('Prioridade: P1')

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar só as mais recentes' }))
    expect(await frases()).toHaveLength(10)
  })

  it('o historico que falha diz que o resto do card esta inteiro, e tenta de novo', async () => {
    dublê.historico
      .mockRejectedValueOnce(new Error('sem rede'))
      .mockResolvedValue([linha('ReportCreated', 0)])
    montar()

    expect(await screen.findByText(/O histórico não carregou\./)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await frases()).toEqual(['Relato recebido'])
    expect(dublê.historico).toHaveBeenCalledTimes(2)
  })
})
