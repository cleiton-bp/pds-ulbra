// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ModerationItemViewModel,
  ModerationQueueViewModel,
  ProjectViewModel,
} from '@/contracts'
import { ModerationScreen } from '@/features/moderation/ModerationScreen'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O texto inteiro, e nao um resumo.** Quem decide publicar precisa ler o que
 * vai publicar — o que vaza costuma estar no meio de um paragrafo, e nao nas
 * primeiras palavras. Uma tela que cortasse passaria em qualquer teste de
 * comportamento e falharia no unico criterio que importa aqui.
 *
 * **A fila diz que ha mais.** Ela mostra os mais antigos e nao pagina: sem a
 * frase, quem visse cinquenta concluiria que sao cinquenta, e o resto ficaria
 * pendente para sempre.
 *
 * **Liberar nao publica sozinho**, e a tela nao pode prometer que sim.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<() => Promise<ModerationQueueViewModel>>(),
  decidir: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectReportService: {
      listModeration: dublê.listar,
      moderateReport: dublê.decidir,
    },
  }
})

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: '2026-09-21T12:00:00.000Z',
  UpdatedAt: '2026-09-21T12:00:00.000Z',
}

/** A linha base da fila, sem o `!` que o `Items[0]` obrigaria em cada uso. */
const ITEM: ModerationItemViewModel = {
  PublicId: 'r-1',
  TrackingCode: 'ABCD-EFGH-JKLM',
  Type: 'Bug',
  Text: '',
  ReporterName: null,
  ReporterNameIsPublic: false,
  State: 'Pending',
  ModeratedAt: null,
  ModeratedByName: null,
  CreatedAt: '2026-09-21T12:00:00.000Z',
}

const LONGO =
  'O botão não responde no passo de pagamento. Tentei três vezes e o meu CPF é 000.000.000-00, se ajudar.'

function fila(mudanca: Partial<ModerationQueueViewModel> = {}): ModerationQueueViewModel {
  return { Items: [{ ...ITEM, Text: LONGO }], PendingTotal: 1, ...mudanca }
}

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ project: projeto }} />,
        children: [{ index: true, element: <ModerationScreen /> }],
      },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)
}

describe('ModerationScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.listar.mockResolvedValue(fila())
  })

  it('mostra o texto inteiro, e não um resumo', async () => {
    montar()

    // O trecho perigoso está no **fim** da frase. Uma tela que cortasse deixaria
    // alguém liberar sem nunca ter visto o que estava ali.
    expect(await screen.findByText(LONGO)).toBeTruthy()
  })

  it('libera mandando Approved, e recarrega a fila', async () => {
    dublê.decidir.mockResolvedValue({})
    montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Liberar' }))

    await waitFor(() => expect(dublê.decidir).toHaveBeenCalledTimes(1))
    expect(dublê.decidir).toHaveBeenCalledWith('p-1', 'r-1', { Decision: 'Approved' })
  })

  it('não publicar manda Rejected', async () => {
    dublê.decidir.mockResolvedValue({})
    montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Não publicar' }))

    await waitFor(() => expect(dublê.decidir).toHaveBeenCalledTimes(1))
    expect(dublê.decidir).toHaveBeenCalledWith('p-1', 'r-1', { Decision: 'Rejected' })
  })

  it('não oferece devolver para a fila: mudar de ideia é decidir de novo', async () => {
    dublê.listar.mockResolvedValue(
      fila({
        Items: [
          {
            ...ITEM,
            Text: LONGO,
            State: 'Approved',
            ModeratedAt: '2026-09-21T13:00:00.000Z',
            ModeratedByName: 'Cleiton',
          },
        ],
        PendingTotal: 0,
      }),
    )
    montar()

    await screen.findByText(/Liberado por Cleiton/i)

    // A saída é "tirar do público", e não "voltar para a fila": alguém já leu, e
    // a fila não deve cobrar de novo o que foi lido.
    expect(screen.getByRole('button', { name: 'Tirar do público' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /fila/i })).toBeNull()
  })

  it('diz quantos ficaram de fora quando a fila não coube', async () => {
    dublê.listar.mockResolvedValue(fila({ PendingTotal: 96 }))
    montar()

    expect(await screen.findByText(/Mostrando os 1 mais antigos de 96/i)).toBeTruthy()
  })

  it('com tudo decidido, não inventa que a fila coube', async () => {
    montar()

    await screen.findByText(LONGO)
    expect(screen.queryByText(/mais antigos de/i)).toBeNull()
  })

  it('a aba dos liberados avisa que liberar não publica sozinho', async () => {
    dublê.listar.mockResolvedValue(fila({ Items: [], PendingTotal: 0 }))
    montar()

    fireEvent.click(await screen.findByRole('button', { name: /Liberados/ }))

    expect(
      await screen.findByText(/só faz o relato aparecer se o projeto estiver num nível público/i),
    ).toBeTruthy()
  })

  it('mostra que a pessoa deu o nome e pediu para ele não aparecer', async () => {
    dublê.listar.mockResolvedValue(
      fila({
        Items: [{ ...ITEM, Text: LONGO, ReporterName: 'Bruno', ReporterNameIsPublic: false }],
      }),
    )
    montar()

    // Coletar é uma coisa, publicar é outra — e quem modera precisa saber de qual
    // das duas se trata antes de liberar.
    expect(await screen.findByText(/pediu para o nome não aparecer/i)).toBeTruthy()
  })
})
