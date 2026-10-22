// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicReportViewModel } from '@/contracts'
import { TrackingPage } from '@/tracking/TrackingPage'

/**
 * O QUE ESTES TESTES TRAVAM: quem relatou le o que escreveu como respondeu.
 *
 * - **Cada resposta embaixo da pergunta como ela estava no envio** — a pagina mostra o
 *   que a API guardou, e nao a pergunta de hoje.
 * - **A caixa livre depois das perguntas vem como "Mais detalhes"**, no fim.
 * - **Com respostas, o texto juntado nao aparece de novo**; sem elas, e o texto que
 *   aparece, inteiro, como ela escreveu.
 */

const dublê = vi.hoisted(() => ({
  abrir: vi.fn(),
  anexos: vi.fn(),
  anexosPorCodigo: vi.fn(),
  midia: vi.fn(),
}))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()

  return {
    ...real,
    reportService: {
      openReportTracking: dublê.abrir,
      confirmReport: vi.fn(),
      reopenReport: vi.fn(),
      replyToReport: vi.fn(),
      openByReporterCode: vi.fn(),
    },
    // Sem isto a pagina buscaria os anexos de verdade, pela rede, em todo teste.
    publicMediaService: {
      listTrackingAttachments: dublê.anexos,
      listAttachmentsByReporterCode: dublê.anexosPorCodigo,
      loadTrackingMediaSettings: dublê.midia,
    },
  }
})

const relato: PublicReportViewModel = {
  TrackingCode: '7K2M-9QXP-4TRV',
  TypeName: 'Defeito',
  Answers: null,
  Title: null,
  Text: 'O botão de finalizar compra não responde.\nTentei duas vezes.',
  CreatedAt: '2026-09-12T13:24:00.000Z',
  Journey: [],
  Closure: null,
  Conversation: [],
  InfoRequest: null,
  CanReply: false,
  Reopenings: [],
  TrackingIntro: 'Este é o registro do que você enviou.',
  ReporterFirstName: null,
  ProjectName: null,
}

/** O relato de um tipo com perguntas: as respostas, e o texto que e elas juntas. */
const respondido: PublicReportViewModel = {
  ...relato,
  Title: 'Finalizar compra travado',
  Text: 'Finalizar a compra\n\nO botão não responde\n\nUsei o celular',
  Answers: [
    { Question: 'O que você tentou fazer?', Answer: 'Finalizar a compra' },
    { Question: 'O que aconteceu?', Answer: 'O botão não responde' },
    { Question: null, Answer: 'Usei o celular' },
  ],
}

function abrirEm(endereco: string): void {
  window.history.replaceState({}, '', endereco)
}

afterEach(cleanup)

beforeEach(() => {
  for (const mock of Object.values(dublê)) mock.mockReset()
  dublê.anexos.mockResolvedValue([])
  dublê.anexosPorCodigo.mockResolvedValue([])
  dublê.midia.mockResolvedValue({
    IsEnabled: false,
    AllowsScreenCapture: false,
    AllowsOnInfoRequest: false,
    AllowsOnReopen: false,
    Kinds: [],
  })
  abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')
})

describe('as respostas na pagina de acompanhamento', () => {
  it('mostra cada resposta embaixo da pergunta, e a caixa livre no fim como "Mais detalhes"', async () => {
    dublê.abrir.mockResolvedValue(respondido)
    render(<TrackingPage />)

    const pergunta = await screen.findByText('O que você tentou fazer?')
    expect(pergunta.tagName).toBe('DT')
    expect(pergunta.nextElementSibling?.textContent).toBe('Finalizar a compra')

    const lista = pergunta.closest('dl') as HTMLElement
    expect(Array.from(lista.querySelectorAll('dt')).map((item) => item.textContent)).toEqual([
      'O que você tentou fazer?',
      'O que aconteceu?',
      'Mais detalhes',
    ])
    expect(Array.from(lista.querySelectorAll('dd')).map((item) => item.textContent)).toEqual([
      'Finalizar a compra',
      'O botão não responde',
      'Usei o celular',
    ])
  })

  it('o titulo dela vem acima das respostas', async () => {
    dublê.abrir.mockResolvedValue(respondido)
    render(<TrackingPage />)

    const titulo = await screen.findByText('Finalizar compra travado')
    const pergunta = screen.getByText('O que você tentou fazer?')
    expect(titulo.compareDocumentPosition(pergunta) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('com respostas, o texto juntado nao aparece de novo', async () => {
    dublê.abrir.mockResolvedValue(respondido)
    render(<TrackingPage />)

    await screen.findByText('O que você tentou fazer?')
    expect(
      screen.queryByText((_, elemento) => elemento?.textContent === respondido.Text),
    ).toBeNull()
  })

  it('sem perguntas, o texto inteiro como a pessoa escreveu, sem rotulo', async () => {
    dublê.abrir.mockResolvedValue(relato)
    render(<TrackingPage />)

    const texto = await screen.findByText(
      (_, elemento) => elemento?.tagName === 'P' && elemento.textContent === relato.Text,
    )
    expect(texto).toBeTruthy()
    expect(screen.queryByText('Mais detalhes')).toBeNull()
    expect(screen.queryByText('O que aconteceu?')).toBeNull()
  })
})
