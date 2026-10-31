// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IdentitySettingsViewModel,
  ModerationItemViewModel,
  ModerationQueueViewModel,
  ProjectViewModel,
} from '@/contracts'
import { type ModerationQuery, PanelError, type RealtimeHandlers } from '@/data'
import { ModerationScreen } from '@/features/moderation/ModerationScreen'
import { useToastStore } from '@/shared/components/toastStore'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O texto inteiro, e nao um resumo**, no detalhe. A lista compacta mostra a primeira
 * linha — ela e para achar —, mas quem decide publicar le o texto todo: o que vaza
 * costuma estar no meio de um paragrafo.
 *
 * **A fila pagina pelo cursor e diz quantos ha.** "Mostrar mais (25 de N)": sem o
 * numero, quem visse vinte e cinco concluiria que sao vinte e cinco.
 *
 * **Decidir tira da lista ali mesmo, sem reler**, e escolhe o proximo. O teclado faz o
 * mesmo que os botoes, e o lote decide um por vez, com o 409 de quem decidiu antes
 * marcado no relato.
 *
 * **O tempo real so reconta**: "N novos — mostrar", e a lista nao muda debaixo de quem
 * le.
 *
 * **Liberar nao publica sozinho**, e a tela nao pode prometer que sim. **Em projeto
 * privado a tela diz isso no topo, e a aba Esperando deixa de contar.**
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<(id: string, query: ModerationQuery) => Promise<ModerationQueueViewModel>>(),
  decidir: vi.fn(),
  identidade: vi.fn<() => Promise<IdentitySettingsViewModel>>(),
  tipos: vi.fn(),
  origens: vi.fn(),
  conectar: vi.fn(),
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
    projectReportTypeService: { listReportTypes: dublê.tipos },
    projectOriginService: { listObservedOrigins: dublê.origens },
    realtimeService: { connectWork: dublê.conectar },
  }
})

function identidade(visibility: IdentitySettingsViewModel['Visibility']) {
  return {
    Mode: 'PersonalCode',
    Visibility: visibility,
    AsksForName: false,
    IdentityPublicKey: null,
    IdentityTokenMaxMinutes: 15,
    IdentityRequired: false,
  } as const
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
  Type: { PublicId: 'tipo-defeito', Name: 'Defeito', Color: 'Red', Icon: 'Bug', IsActive: true },
  Text: '',
  ReporterName: null,
  ReporterNameIsPublic: false,
  State: 'Pending',
  ModeratedAt: null,
  ModeratedByName: null,
  CreatedAt: '2026-09-21T12:00:00.000Z',
  Findings: [],
  FindingsTruncated: false,
  PublicStageLabel: 'Recebido',
}

const LONGO =
  'O botão não responde no passo de pagamento. Tentei três vezes e o meu CPF é 000.000.000-00, se ajudar.'

function fila(mudanca: Partial<ModerationQueueViewModel> = {}): ModerationQueueViewModel {
  return {
    Items: [{ ...ITEM, Text: LONGO }],
    PendingTotal: 1,
    Counts: { Pending: 1, Approved: 4, Rejected: 2 },
    NextCursor: null,
    HasMore: false,
    ...mudanca,
  }
}

/** Tres pendentes, para andar, decidir e marcar. */
const TRES = ['r-1', 'r-2', 'r-3'].map((id, i) => ({
  ...ITEM,
  PublicId: id,
  TrackingCode: `CODE-000${i + 1}`,
  Text: `Relato número ${i + 1}`,
}))

let avisos: RealtimeHandlers | null = null

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

/** O relato aberto ao lado: o texto inteiro mora nele. */
const detalhe = () => screen.findByRole('article')
const textoNoDetalhe = async (texto: string) => within(await detalhe()).getAllByText(texto)[0]
const linhas = () =>
  within(screen.getByRole('region', { name: 'Relatos' })).getAllByRole('listitem')
const escolhido = () =>
  screen.getAllByRole('button').find((botao) => botao.getAttribute('aria-current') === 'true')
    ?.textContent ?? ''
const avisosDoFim = () => useToastStore.getState().toasts

function preparar() {
  for (const mock of Object.values(dublê)) mock.mockReset()
  useToastStore.setState({ toasts: [] })
  avisos = null
  dublê.listar.mockResolvedValue(fila())
  dublê.identidade.mockResolvedValue(identidade('PublicAnonymous'))
  dublê.tipos.mockResolvedValue([])
  dublê.origens.mockResolvedValue([])
  dublê.conectar.mockImplementation((_id: string, handlers: RealtimeHandlers) => {
    avisos = handlers
    return { stop: () => Promise.resolve() }
  })
}

describe('ModerationScreen', () => {
  afterEach(cleanup)
  beforeEach(preparar)

  it('mostra o texto inteiro no detalhe, e não um resumo', async () => {
    montar()

    // O trecho perigoso esta no **fim** da frase. Uma tela que cortasse deixaria
    // alguem liberar sem nunca ter visto o que estava ali.
    expect((await textoNoDetalhe(LONGO))?.textContent).toBe(LONGO)
  })

  it('libera mandando Approved e o estado visto, e tira da lista sem reler', async () => {
    dublê.listar.mockResolvedValue(
      fila({ Items: TRES, Counts: { Pending: 3, Approved: 0, Rejected: 0 } }),
    )
    dublê.decidir.mockResolvedValue({})
    montar()

    fireEvent.click(await within(await detalhe()).findByRole('button', { name: 'Liberar' }))

    await waitFor(() => expect(linhas()).toHaveLength(2))
    expect(dublê.decidir).toHaveBeenCalledWith('p-1', 'r-1', {
      Decision: 'Approved',
      From: 'Pending',
    })
    // Uma leitura so: a da abertura. Reler recolhia a lista e voltava a rolagem.
    expect(dublê.listar).toHaveBeenCalledTimes(1)
    // O proximo fica escolhido, e as abas contam o que mudou.
    expect(escolhido()).toContain('CODE-0002')
    expect(screen.getByRole('tab', { name: /^Liberados/ }).textContent).toBe('Liberados (1)')
  })

  it('não publicar manda Rejected', async () => {
    dublê.decidir.mockResolvedValue({})
    montar()

    fireEvent.click(await within(await detalhe()).findByRole('button', { name: 'Não publicar' }))

    await waitFor(() => expect(dublê.decidir).toHaveBeenCalledTimes(1))
    expect(dublê.decidir).toHaveBeenCalledWith('p-1', 'r-1', {
      Decision: 'Rejected',
      From: 'Pending',
    })
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
            ModeratedByName: 'Caio',
          },
        ],
      }),
    )
    montar()

    await screen.findByText(/Liberado por Caio/i)

    // A saida e "tirar do publico", e nao "voltar para a fila": alguem ja leu, e
    // a fila nao deve cobrar de novo o que foi lido.
    expect(within(await detalhe()).getByRole('button', { name: 'Tirar do público' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /fila/i })).toBeNull()
  })

  it('diz quantos há quando a fila não coube, e continua pelo cursor', async () => {
    dublê.listar
      .mockResolvedValueOnce(
        fila({
          Counts: { Pending: 2, Approved: 0, Rejected: 0 },
          NextCursor: 'c-1',
          HasMore: true,
        }),
      )
      .mockResolvedValueOnce(
        fila({
          Items: [{ ...ITEM, PublicId: 'r-2', TrackingCode: 'CODE-0002', Text: 'O segundo' }],
          Counts: { Pending: 2, Approved: 0, Rejected: 0 },
        }),
      )
    montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar mais (1 de 2)' }))

    await waitFor(() => expect(linhas()).toHaveLength(2))
    expect(dublê.listar).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ state: 'Pending', after: 'c-1', limit: 25 }),
    )
    // Acabou: o botao some, e a tela nao inventa que ha mais.
    expect(screen.queryByRole('button', { name: /Mostrar mais/ })).toBeNull()
  })

  it('com tudo carregado, não inventa que há mais', async () => {
    montar()

    await detalhe()
    expect(screen.queryByRole('button', { name: /Mostrar mais/ })).toBeNull()
  })

  it('as abas contam, e a dos liberados pede o histórico e avisa que liberar não publica sozinho', async () => {
    montar()
    await detalhe()

    expect(screen.getByRole('tab', { name: /^Esperando/ }).textContent).toBe('Esperando (1)')
    expect(screen.getByRole('tab', { name: /^Não publicáveis/ }).textContent).toBe(
      'Não publicáveis (2)',
    )

    dublê.listar.mockResolvedValue(fila({ Items: [] }))
    fireEvent.click(screen.getByRole('tab', { name: /^Liberados/ }))

    expect(
      await screen.findByText(/só faz o relato aparecer se o projeto estiver num nível público/i),
    ).toBeTruthy()
    expect(dublê.listar).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ state: 'Approved' }),
    )
    expect(screen.getByRole('tab', { name: /^Liberados/ }).getAttribute('aria-selected')).toBe(
      'true',
    )
  })

  it('as setas trocam de aba, como nas abas de Domínios', async () => {
    montar()
    await detalhe()

    fireEvent.keyDown(screen.getByRole('tab', { name: /^Esperando/ }), { key: 'ArrowRight' })

    await waitFor(() =>
      expect(dublê.listar).toHaveBeenLastCalledWith(
        'p-1',
        expect.objectContaining({ state: 'Approved' }),
      ),
    )
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /^Liberados/ }))
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

    // **Marcar no lugar, e nao so listar embaixo.** Num paragrafo longo, uma
    // etiqueta que diz "tem um CPF aqui" obriga a procurar — e procurar e onde o
    // olho passa direto.
    const marca = await screen.findByText('000.000.000-00')
    expect(marca.tagName).toBe('MARK')

    // E o texto continua inteiro em volta da marca.
    expect(marca.closest('p')?.textContent).toBe(LONGO)
    // A lista diz "sensivel" sem abrir o relato.
    expect(within(linhas()[0] as HTMLElement).getByText('sensível')).toBeTruthy()
  })

  it('o aviso diz que não impede nada, e que pode estar errado', async () => {
    dublê.listar.mockResolvedValue(
      fila({
        Items: [
          { ...ITEM, Text: LONGO, Findings: [{ Kind: 'Cpf', Start: 0, Length: 3, Sample: '***' }] },
        ],
      }),
    )
    montar()

    // Um aviso que soasse como veredito faria o time liberar no automatico quando
    // ele nao aparecesse — e e ai que a varredura erra, deixando passar.
    expect(await screen.findByText(/Isto não impede nada, e pode estar errado/i)).toBeTruthy()

    // E liberar continua sendo possivel com o achado na tela.
    const liberar = within(await detalhe()).getByRole('button', { name: 'Liberar' })
    expect((liberar as HTMLButtonElement).disabled).toBe(false)
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

    // Doze nao e "todos": um texto colado de um log tem centenas de credenciais
    // iguais, e deixar quem le achar que viu a lista inteira ajuda a decidir errado.
    expect(await screen.findByText(/Paramos de listar depois de 1/i)).toBeTruthy()
  })

  it('sem achado nenhum, não inventa aviso', async () => {
    montar()

    await detalhe()
    expect(screen.queryByText(/parece dado sensível/i)).toBeNull()
    expect(document.querySelector('mark')).toBeNull()
  })

  it('mostra que a pessoa deu o nome e pediu para ele não aparecer', async () => {
    dublê.listar.mockResolvedValue(
      fila({
        Items: [{ ...ITEM, Text: LONGO, ReporterName: 'Bruno', ReporterNameIsPublic: false }],
      }),
    )
    montar()

    // Coletar e uma coisa, publicar e outra — e quem modera precisa saber de qual
    // das duas se trata antes de liberar.
    expect(await screen.findByText(/pediu para o nome não aparecer/i)).toBeTruthy()
  })

  it('em projeto público anônimo, não promete que o nome vai aparecer', async () => {
    dublê.listar.mockResolvedValue(
      fila({
        Items: [{ ...ITEM, Text: LONGO, ReporterName: 'Bruno', ReporterNameIsPublic: true }],
      }),
    )
    montar()

    expect(await screen.findByText(/este projeto não mostra nomes ao público/i)).toBeTruthy()
    // E a previa sai sem o nome, como a lista publica sairia.
    const previa = screen.getByRole('region', { name: 'Prévia na lista pública' })
    expect(within(previa).queryByText(/Bruno/)).toBeNull()
  })

  it('mostra a prévia da lista pública, com a etapa e o aviso dos últimos liberados', async () => {
    dublê.identidade.mockResolvedValue(identidade('PublicIdentified'))
    dublê.listar.mockResolvedValue(
      fila({
        Items: [{ ...ITEM, Text: LONGO, ReporterName: 'Bruno', ReporterNameIsPublic: true }],
      }),
    )
    montar()

    expect(await screen.findByText('Na lista pública vai aparecer assim')).toBeTruthy()
    const previa = screen.getByRole('region', { name: 'Prévia na lista pública' })
    await waitFor(() => expect(within(previa).getByText(/Defeito · Bruno/)).toBeTruthy())
    expect(within(previa).getByText('Recebido')).toBeTruthy()
    expect(within(previa).getByText(/mostra só os 20 últimos liberados/)).toBeTruthy()
  })

  it('o 409 diz que outra pessoa decidiu, e o relato fica marcado', async () => {
    dublê.decidir.mockRejectedValue(new PanelError('Outra pessoa ja decidiu este relato.', 409))
    montar()

    fireEvent.click(await within(await detalhe()).findByRole('button', { name: 'Liberar' }))

    expect(await screen.findByText('Outra pessoa já decidiu este relato.')).toBeTruthy()
    expect(within(linhas()[0] as HTMLElement).getByText('decidido por outra pessoa')).toBeTruthy()
    expect(within(await detalhe()).queryByRole('button', { name: 'Liberar' })).toBeNull()
  })

  it('o teclado anda (J/K), seleciona (X) e decide (L/N)', async () => {
    dublê.listar.mockResolvedValue(
      fila({ Items: TRES, Counts: { Pending: 3, Approved: 0, Rejected: 0 } }),
    )
    dublê.decidir.mockResolvedValue({})
    montar()
    await detalhe()

    fireEvent.keyDown(document.body, { key: 'j' })
    expect(escolhido()).toContain('CODE-0002')
    fireEvent.keyDown(document.body, { key: 'k' })
    expect(escolhido()).toContain('CODE-0001')

    fireEvent.keyDown(document.body, { key: 'x' })
    expect(await screen.findByText('1 selecionado')).toBeTruthy()

    fireEvent.keyDown(document.body, { key: 'n' })
    await waitFor(() =>
      expect(dublê.decidir).toHaveBeenCalledWith('p-1', 'r-1', {
        Decision: 'Rejected',
        From: 'Pending',
      }),
    )
    await waitFor(() => expect(escolhido()).toContain('CODE-0002'))

    fireEvent.keyDown(document.body, { key: 'l' })
    await waitFor(() =>
      expect(dublê.decidir).toHaveBeenCalledWith('p-1', 'r-2', {
        Decision: 'Approved',
        From: 'Pending',
      }),
    )
    await waitFor(() => expect(linhas()).toHaveLength(1))
  })

  it('o teclado não decide quem está escrevendo na busca', async () => {
    montar()
    await detalhe()

    fireEvent.keyDown(screen.getByPlaceholderText('Texto, #número ou protocolo'), { key: 'l' })

    expect(dublê.decidir).not.toHaveBeenCalled()
  })

  it('o lote decide um por vez, segue depois do 409 e marca quem foi decidido por outra pessoa', async () => {
    dublê.listar.mockResolvedValue(
      fila({ Items: TRES, Counts: { Pending: 3, Approved: 0, Rejected: 0 } }),
    )
    dublê.decidir
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new PanelError('Outra pessoa ja decidiu este relato.', 409))
      .mockResolvedValueOnce({})
    montar()
    await detalhe()

    fireEvent.click(screen.getByLabelText('Selecionar os 3 carregados'))
    const barra = screen.getByRole('region', { name: 'Ações em lote' })
    fireEvent.click(within(barra).getByRole('button', { name: 'Liberar' }))

    await waitFor(() => expect(dublê.decidir).toHaveBeenCalledTimes(3))
    expect(dublê.decidir.mock.calls.map((chamada) => chamada[1])).toEqual(['r-1', 'r-2', 'r-3'])
    for (const chamada of dublê.decidir.mock.calls)
      expect(chamada[2]).toEqual({ Decision: 'Approved', From: 'Pending' })

    // Os dois liberados saem; o de outra pessoa fica, marcado e fora da selecao.
    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(within(linhas()[0] as HTMLElement).getByText('decidido por outra pessoa')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Ações em lote' })).toBeNull()

    const aviso = avisosDoFim().at(-1)
    expect(aviso?.message).toBe(
      '2 liberados para o público. 1 já tinha sido decidido por outra pessoa.',
    )
    // Na fila, desfazer seria voltar para "ninguem decidiu", e a API recusa: o aviso
    // oferece tirar do publico.
    expect(aviso?.action?.label).toBe('Tirar do público')
  })

  it('no histórico, o lote oferece Desfazer, que volta pela mesma rota conferindo o estado', async () => {
    const liberados = TRES.slice(0, 2).map((item) => ({ ...item, State: 'Approved' as const }))
    dublê.listar.mockResolvedValue(
      fila({ Items: liberados, Counts: { Pending: 0, Approved: 2, Rejected: 0 } }),
    )
    dublê.decidir.mockResolvedValue({})
    montar()
    fireEvent.click(await screen.findByRole('tab', { name: /^Liberados/ }))
    await waitFor(() => expect(linhas()).toHaveLength(2))

    fireEvent.click(screen.getByLabelText('Selecionar os 2 carregados'))
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Ações em lote' })).getByRole('button', {
        name: 'Tirar do público',
      }),
    )
    await waitFor(() => expect(avisosDoFim().at(-1)?.message).toBe('2 tirados do público.'))

    const desfazer = avisosDoFim().at(-1)?.action
    expect(desfazer?.label).toBe('Desfazer')
    await act(async () => desfazer?.run())

    await waitFor(() =>
      expect(dublê.decidir).toHaveBeenCalledWith('p-1', 'r-1', {
        Decision: 'Approved',
        From: 'Rejected',
      }),
    )
  })

  it('o tempo real reconta e diz "N novos", sem mexer na lista', async () => {
    montar()
    await detalhe()
    await waitFor(() => expect(avisos).not.toBeNull())

    dublê.listar.mockResolvedValue(fila({ Counts: { Pending: 3, Approved: 4, Rejected: 2 } }))
    act(() => {
      avisos?.onEvent({
        kind: 'card',
        notice: {
          ProjectPublicId: 'p-1',
          ReportPublicId: 'r-9',
          StatePublicId: null,
          Archived: false,
          Origin: null,
        },
      })
    })

    const novos = await screen.findByRole(
      'button',
      { name: '2 novos — mostrar' },
      { timeout: 2000 },
    )
    // So contou: uma pagina de um, e a lista continua a mesma.
    expect(dublê.listar).toHaveBeenLastCalledWith('p-1', expect.objectContaining({ limit: 1 }))
    expect(linhas()).toHaveLength(1)
    expect(screen.getByRole('tab', { name: /^Esperando/ }).textContent).toBe('Esperando (3)')

    fireEvent.click(novos)
    await waitFor(() =>
      expect(dublê.listar).toHaveBeenLastCalledWith('p-1', expect.objectContaining({ limit: 25 })),
    )
  })

  it('a busca espera parar de digitar e vai para a API', async () => {
    montar()
    await detalhe()

    fireEvent.change(screen.getByPlaceholderText('Texto, #número ou protocolo'), {
      target: { value: 'pagamento' },
    })

    await waitFor(() =>
      expect(dublê.listar).toHaveBeenLastCalledWith(
        'p-1',
        expect.objectContaining({ q: 'pagamento' }),
      ),
    )
  })
})

describe('ModerationScreen num projeto privado', () => {
  afterEach(cleanup)

  beforeEach(() => {
    preparar()
    dublê.listar.mockResolvedValue(
      fila({ PendingTotal: 7, Counts: { Pending: 7, Approved: 0, Rejected: 0 } }),
    )
  })

  const aba = () => screen.getByRole('tab', { name: /^Esperando/ })

  it('diz no topo que nada aparece para o público, e a aba não conta', async () => {
    dublê.identidade.mockResolvedValue(identidade('Private'))
    montar()

    expect(await screen.findByText(/nada daqui\s+aparece para o público/)).toBeTruthy()
    // Quem administra le onde abrir ao publico.
    expect(
      screen.getByText(/A fila só importa se você abrir os relatos ao público em Quem relata/),
    ).toBeTruthy()
    await detalhe()
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

    await detalhe()
    await waitFor(() => expect(aba().textContent).toBe('Esperando (7)'))
    expect(screen.queryByText(/Este projeto é privado/)).toBeNull()
  })

  it('sem conseguir ler se é privado, a tela fica como era: sem faixa, com o número', async () => {
    dublê.identidade.mockRejectedValue(new Error('rede'))
    montar()

    await detalhe()
    await waitFor(() => expect(aba().textContent).toBe('Esperando (7)'))
    expect(screen.queryByText(/Este projeto é privado/)).toBeNull()
  })
})
