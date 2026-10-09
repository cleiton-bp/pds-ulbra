// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IdentitySettingsViewModel,
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
 *
 * **Em projeto privado a tela diz isso no topo, e a aba deixa de contar.** Com o
 * numero, a fila parecia uma tarefa que nunca acaba, e o time ia "limpa-la" por
 * obrigacao. A dica de onde abrir ao publico e so para quem administra — o membro
 * nao tem a tela Quem relata. Sem conseguir ler se e privado, a tela fica como era.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<() => Promise<ModerationQueueViewModel>>(),
  decidir: vi.fn(),
  identidade: vi.fn<() => Promise<IdentitySettingsViewModel>>(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectReportService: {
      listModeration: dublê.listar,
      moderateReport: dublê.decidir,
    },
    // Privado ou publico vem de Quem relata. Sem o duble, a leitura ia a rede de
    // verdade em todo teste, e a tela ficava sempre "como se fosse publico".
    projectIdentitySettingsService: {
      ...real.projectIdentitySettingsService,
      getIdentitySettings: dublê.identidade,
    },
  }
})

function identidade(visibility: IdentitySettingsViewModel['Visibility']) {
  return { Mode: 'PersonalCode', Visibility: visibility, AsksForName: false } as const
}

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: '2026-09-21T12:00:00.000Z',
  UpdatedAt: '2026-09-21T12:00:00.000Z',
  Account: { PublicId: 'conta-1', Name: 'Conta de teste' },
  Role: 'Administrator',
  IsAccountOwner: true,
  LastReportReceivedAt: null,
  LastActivityAt: null,
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
  Findings: [],
  FindingsTruncated: false,
}

const LONGO =
  'O botão não responde no passo de pagamento. Tentei três vezes e o meu CPF é 000.000.000-00, se ajudar.'

function fila(mudanca: Partial<ModerationQueueViewModel> = {}): ModerationQueueViewModel {
  return { Items: [{ ...ITEM, Text: LONGO }], PendingTotal: 1, ...mudanca }
}

function montar(project: ProjectViewModel = projeto) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ project }} />,
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
    dublê.identidade.mockResolvedValue(identidade('PublicAnonymous'))
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

  it('marca o trecho suspeito dentro do próprio texto', async () => {
    dublê.listar.mockResolvedValue(
      fila({
        Items: [
          {
            ...ITEM,
            Text: LONGO,
            Findings: [
              {
                Kind: 'Cpf',
                Start: LONGO.indexOf('000.000.000-00'),
                Length: '000.000.000-00'.length,
                Sample: '00**********00',
              },
            ],
          },
        ],
      }),
    )
    montar()

    // **Marcar no lugar, e não só listar embaixo.** Num parágrafo longo, uma
    // etiqueta que diz "tem um CPF aqui" obriga a procurar — e procurar é onde o
    // olho passa direto.
    const marca = await screen.findByText('000.000.000-00')
    expect(marca.tagName).toBe('MARK')

    // E o texto continua inteiro em volta da marca.
    expect(marca.closest('p')?.textContent).toBe(LONGO)
  })

  it('o aviso diz que não impede nada, e que pode estar errado', async () => {
    dublê.listar.mockResolvedValue(
      fila({
        Items: [
          {
            ...ITEM,
            Text: LONGO,
            Findings: [{ Kind: 'Cpf', Start: 0, Length: 3, Sample: '***' }],
          },
        ],
      }),
    )
    montar()

    // Um aviso que soasse como veredito faria o time liberar no automático quando
    // ele não aparecesse — e é aí que a varredura erra, deixando passar.
    expect(await screen.findByText(/Isto não impede nada, e pode estar errado/i)).toBeTruthy()

    // E liberar continua sendo possível com o achado na tela.
    expect((screen.getByRole('button', { name: 'Liberar' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('a amostra do achado vem mascarada, e não repete o dado', async () => {
    dublê.listar.mockResolvedValue(
      fila({
        Items: [
          {
            ...ITEM,
            Text: 'contato: ana@exemplo.com',
            Findings: [{ Kind: 'Email', Start: 9, Length: 15, Sample: 'a**@exemplo.com' }],
          },
        ],
      }),
    )
    montar()

    // A etiqueta viaja mais do que o relato: cabe num print, num log do painel.
    expect(await screen.findByText('a**@exemplo.com')).toBeTruthy()
    expect(screen.getByText('E-mail:', { exact: false }).textContent).not.toContain(
      'ana@exemplo.com',
    )
  })

  it('quando a varredura para no teto, diz que há mais do que a lista', async () => {
    dublê.listar.mockResolvedValue(
      fila({
        Items: [
          {
            ...ITEM,
            Text: LONGO,
            Findings: [{ Kind: 'Token', Start: 0, Length: 3, Sample: '***' }],
            FindingsTruncated: true,
          },
        ],
      }),
    )
    montar()

    // Doze não é "todos": um texto colado de um log tem centenas de credenciais
    // iguais, e deixar quem lê achar que viu a lista inteira ajuda a decidir errado.
    expect(await screen.findByText(/Paramos de listar depois de 1/i)).toBeTruthy()
  })

  it('sem achado nenhum, não inventa aviso', async () => {
    montar()

    await screen.findByText(LONGO)
    expect(screen.queryByText(/dado sensível/i)).toBeNull()
    expect(document.querySelector('mark')).toBeNull()
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

describe('ModerationScreen num projeto privado', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.listar.mockResolvedValue(fila({ PendingTotal: 7 }))
  })

  const aba = () => screen.getByRole('button', { name: /^Esperando/ })

  it('diz no topo que nada aparece para o público, e a aba não conta', async () => {
    dublê.identidade.mockResolvedValue(identidade('Private'))
    montar()

    expect(await screen.findByText(/nada daqui\s+aparece para o público/)).toBeTruthy()
    // Quem administra le onde abrir ao publico.
    expect(
      screen.getByText(/A fila só importa se você abrir os relatos ao público em Quem relata/),
    ).toBeTruthy()
    await screen.findByText(LONGO)
    expect(aba().textContent).toBe('Esperando')
  })

  it('quem é só membro lê a faixa, sem a dica da tela que ele não tem', async () => {
    dublê.identidade.mockResolvedValue(identidade('Private'))
    montar({ ...projeto, Role: 'Member', IsAccountOwner: false })

    expect(await screen.findByText(/nada daqui\s+aparece para o público/)).toBeTruthy()
    expect(screen.queryByText(/em Quem relata/)).toBeNull()
  })

  it('num projeto público, sem faixa, e a aba diz quantos esperam', async () => {
    dublê.identidade.mockResolvedValue(identidade('PublicAnonymous'))
    montar()

    await screen.findByText(LONGO)
    await waitFor(() => expect(aba().textContent).toBe('Esperando7'))
    expect(screen.queryByText(/Este projeto é privado/)).toBeNull()
  })

  it('sem conseguir ler se é privado, a tela fica como era: sem faixa, com o número', async () => {
    dublê.identidade.mockRejectedValue(new Error('rede'))
    montar()

    await screen.findByText(LONGO)
    await waitFor(() => expect(aba().textContent).toBe('Esperando7'))
    expect(screen.queryByText(/Este projeto é privado/)).toBeNull()
  })
})
