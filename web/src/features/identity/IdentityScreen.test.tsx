// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IdentitySettingsViewModel,
  ProjectPublicStageViewModel,
  ProjectViewModel,
  SaveWidgetSettingsRequest,
  WidgetSettingsViewModel,
} from '@/contracts'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { IdentityScreen } from '@/features/identity/IdentityScreen'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Esta tela ensina, e o ensino e o requisito.** O requisito diz: "leio a tela sem saber o que e HMAC e consigo montar a integracao com o que
 * esta escrito ali". Uma tela com tres radios e os nomes dos modos passaria em
 * qualquer teste de comportamento e falharia no criterio — por isso o que a escolha
 * **destrava** e o que **custa** sao verificados como conteudo, e nao como enfeite que
 * alguem pode apagar sem quebrar nada. So a escolhida diz: as tres de uma vez eram uma
 * parede de texto antes do primeiro clique.
 *
 * **Projeto sem configuracao salva nao e projeto sem configuracao.** A API
 * responde com o padrao, e a tela desenha aquilo como escolha corrente — sem
 * nenhum estado de "vazio" que sugira que nada esta valendo.
 *
 * **O botao so age quando ha o que salvar**, e o que se manda e o modo escolhido —
 * nao o que veio do servidor. O Salvar mora no titulo, preso no topo ao rolar, e so
 * liga com mudanca.
 *
 * **Cada grupo diz o que esta escolhido e volta ao padrao so no rascunho dele**: o modo e
 * a visibilidade sao de Quem relata, os textos sao da ferramenta.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<IdentitySettingsViewModel>>(),
  salvar: vi.fn(),
  lerFerramenta: vi.fn<() => Promise<WidgetSettingsViewModel>>(),
  salvarFerramenta: vi.fn(),
  listarEtapas: vi.fn<() => Promise<ProjectPublicStageViewModel[]>>(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectIdentitySettingsService: {
      getIdentitySettings: dublê.ler,
      saveIdentitySettings: dublê.salvar,
    },
    // A confirmacao, o topo do acompanhamento e o aviso publico sao da ferramenta.
    projectWidgetSettingsService: {
      getWidgetSettings: dublê.lerFerramenta,
      saveWidgetSettings: dublê.salvarFerramenta,
    },
    // A previa do acompanhamento mostra a jornada de verdade do projeto.
    projectPublicStageService: {
      listPublicStages: dublê.listarEtapas,
    },
  }
})

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: '2026-08-01T12:00:00.000Z',
  UpdatedAt: '2026-08-01T12:00:00.000Z',
  Account: { PublicId: 'conta-1', Name: 'Conta de teste' },
  Role: 'Administrator',
  IsAccountOwner: true,
  LastReportReceivedAt: null,
  LastActivityAt: null,
}

/** O padrao de fabrica, que e o que a API responde para quem nunca salvou nada. */
const padrao: IdentitySettingsViewModel = {
  Mode: 'Protocol',
  Visibility: 'Private',
  AsksForName: false,
  IdentityPublicKey: null,
  IdentityTokenMaxMinutes: 15,
  IdentityRequired: false,
}

function etapa(PublicId: string, Label: string, Position: number): ProjectPublicStageViewModel {
  return {
    PublicId,
    Label,
    Description: `O relato está em ${Label.toLowerCase()}.`,
    NextStep: null,
    Position,
    IsTerminal: false,
    AllowsReturn: false,
    AwaitsReporter: false,
    Outcome: null,
    CreatedAt: '2026-08-01T12:00:00.000Z',
  }
}

// Fora de ordem de proposito: a previa segue a posicao, e nao a ordem da resposta.
const etapas = [
  etapa('e-3', 'Resolvido', 2),
  etapa('e-1', 'Recebido', 0),
  etapa('e-2', 'Em análise', 1),
]

/** O grupo de escolhas, pelo nome dele: as duas perguntas convivem na mesma tela. */
function escolhas(nome: string) {
  return within(screen.getByRole('radiogroup', { name: nome }))
}

/** O grupo da tela (a `section` em volta do acordeao), pelo titulo dele. */
function regiao(nome: string) {
  return within(screen.getByRole('region', { name: nome }))
}

const MODO = 'Como a pessoa é reconhecida'
const VISIBILIDADE = 'Quem pode ver os relatos'

/** O titulo do grupo fechado: o que esta escolhido e o que mudou. */
const resumoDo = (id: string) => document.getElementById(id)?.textContent ?? ''
const detalhesDo = (id: string) =>
  document.getElementById(id)?.closest('details') as HTMLDetailsElement

function montar(entrada = '/p/p-1/identity') {
  const router = createMemoryRouter(
    [
      {
        path: '/p/p-1',
        element: <Outlet context={{ project: projeto }} />,
        children: [
          { path: 'identity', element: <IdentityScreen /> },
          { path: 'domains', element: <p>tela de domínios</p> },
          { path: 'form-texts', element: <p>tela dos textos</p> },
        ],
      },
    ],
    { initialEntries: [entrada] },
  )

  render(<RouterProvider router={router} />)
  return router
}

/** O Salvar mora no titulo, sempre a vista: liga so com o que salvar. */
const salvarLigado = () =>
  !(screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled

const abaEscolhida = () =>
  screen.getAllByRole('tab').find((aba) => aba.getAttribute('aria-selected') === 'true')
    ?.textContent

describe('IdentityScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.ler.mockResolvedValue(padrao)
    dublê.lerFerramenta.mockResolvedValue(DEFAULT_WIDGET_SETTINGS)
    dublê.listarEtapas.mockResolvedValue(etapas)
    dublê.salvarFerramenta.mockImplementation(
      async (_id: string, pedido: SaveWidgetSettingsRequest) => ({
        ...DEFAULT_WIDGET_SETTINGS,
        ...pedido,
      }),
    )
  })

  it('desenha o padrão como escolha corrente, e não como ausência de escolha', async () => {
    montar()

    const protocolo = await screen.findByRole('radio', { name: /Protocolo/ })
    expect((protocolo as HTMLInputElement).checked).toBe(true)

    expect(
      (screen.getByRole('radio', { name: /Código pessoal/ }) as HTMLInputElement).checked,
    ).toBe(false)
  })

  it('oferece os três modos, e nenhum a mais', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(escolhas(MODO).getAllByRole('radio')).toHaveLength(3)
  })

  it('só o modo escolhido diz o que destrava e o que custa, e trocar troca o texto', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    const reconhecimento = regiao('Reconhecimento')

    // Um de cada: as tres explicacoes de uma vez eram a parede de texto antes do clique.
    expect(reconhecimento.getAllByText('Destrava:')).toHaveLength(1)
    expect(reconhecimento.getAllByText('Custo:')).toHaveLength(1)
    // A regra que atravessa a tela fica legivel junto da escolha.
    expect(reconhecimento.getByText(/não há lista pessoal/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: /Código pessoal/ }))
    expect(reconhecimento.queryByText(/não há lista pessoal/i)).toBeNull()
    expect(reconhecimento.getByText(/sem o cliente precisar ter login/i)).toBeTruthy()
    expect(reconhecimento.getAllByText('Destrava:')).toHaveLength(1)
  })

  it('avisa que trocar de modo não mexe no passado', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(screen.getByText(/Trocar de modo não mexe no passado/i)).toBeTruthy()
  })

  it('não salva enquanto nada mudou', async () => {
    montar()

    // Sem mudanca o Salvar fica a vista, desligado, e o titulo diz que esta tudo salvo.
    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(screen.getByText('Tudo salvo')).toBeTruthy()
    expect(salvarLigado()).toBe(false)
  })

  it('manda o modo escolhido, e não o que veio do servidor', async () => {
    dublê.salvar.mockResolvedValue({
      Mode: 'PersonalCode',
      Visibility: 'Private',
      AsksForName: false,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
    })
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Código pessoal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    // **Os dois campos vão juntos**, e o que não mudou vai igual: mandar só o
    // campo alterado faria a API conferir o par com metade dele.
    expect(dublê.salvar).toHaveBeenCalledWith('p-1', {
      Mode: 'PersonalCode',
      Visibility: 'Private',
      AsksForName: false,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
    })
  })

  it('deixa escolher a identidade do sistema, e só salva com a chave pública dele', async () => {
    montar()

    const herdada = await screen.findByRole('radio', { name: /Identidade do seu sistema/ })
    expect((herdada as HTMLInputElement).disabled).toBe(false)
    fireEvent.click(herdada)

    // Sem a chave a API nao conferiria cracha nenhum: o modo gravado nao faria nada.
    const chave = screen.getByLabelText('Chave pública do seu sistema')
    expect(salvarLigado()).toBe(false)

    fireEvent.change(chave, {
      target: { value: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----' },
    })
    expect(salvarLigado()).toBe(true)
  })

  it('com a identidade do sistema já salva, a tela mostra a chave guardada', async () => {
    dublê.ler.mockResolvedValue({
      Mode: 'InheritedIdentity',
      Visibility: 'Private',
      AsksForName: false,
      IdentityPublicKey: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
    })
    montar()

    const herdada = await screen.findByRole('radio', { name: /Identidade do seu sistema/ })
    expect((herdada as HTMLInputElement).checked).toBe(true)
    expect(
      (screen.getByLabelText('Chave pública do seu sistema') as HTMLTextAreaElement).value,
    ).toContain('BEGIN PUBLIC KEY')
  })

  it('depois de salvar, o botão volta a ficar quieto', async () => {
    dublê.salvar.mockResolvedValue({
      Mode: 'PersonalCode',
      Visibility: 'Private',
      AsksForName: false,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
    })
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Código pessoal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    // O Salvar desliga: o que esta na tela e o que esta salvo.
    await waitFor(() => expect(salvarLigado()).toBe(false))
    expect(screen.getByText('Tudo salvo')).toBeTruthy()
    expect(dublê.salvar).toHaveBeenCalledTimes(1)
  })

  it('oferece os três níveis de visibilidade, e o padrão é o mais fechado', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(escolhas(VISIBILIDADE).getAllByRole('radio')).toHaveLength(3)

    const privado = escolhas(VISIBILIDADE).getByRole('radio', { name: /Privado/ })
    expect((privado as HTMLInputElement).checked).toBe(true)
  })

  it('o nível escolhido diz quem vê e o que custa', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    const visibilidade = regiao('Visibilidade')

    // "Público" é palavra que cada um entende de um jeito. O que trava a tela é
    // dizer **quem vê**, e não repetir o nome do nível com outras palavras.
    expect(visibilidade.getAllByText('Quem vê:')).toHaveLength(1)
    expect(visibilidade.getAllByText('Custo:')).toHaveLength(1)
    expect(visibilidade.getByText(/Quem relatou, pelo link dele/)).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: /Público anônimo/ }))
    expect(visibilidade.getByText(/inclusive quem nunca relatou nada/)).toBeTruthy()
  })

  it('no modo protocolo, público identificado não dá para escolher — e a peça diz por quê', async () => {
    montar()

    const identificado = await screen.findByRole('radio', { name: /Público identificado/ })
    expect((identificado as HTMLInputElement).disabled).toBe(true)

    // A trava depende da outra pergunta da tela, então o motivo tem de estar
    // junto: cinza sem explicação faz quem configura concluir que está quebrado.
    expect(identificado.closest('label')?.textContent).toMatch(
      /Depende de um modo que identifique/i,
    )
  })

  it('escolher o código pessoal destrava o público identificado, ali mesmo', async () => {
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Código pessoal/ }))

    const identificado = screen.getByRole('radio', { name: /Público identificado/ })
    expect((identificado as HTMLInputElement).disabled).toBe(false)
  })

  it('voltar ao protocolo não troca a visibilidade sozinho: avisa no grupo e tranca o salvar', async () => {
    dublê.ler.mockResolvedValue({
      Mode: 'PersonalCode',
      Visibility: 'PublicIdentified',
      AsksForName: false,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
    })
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Protocolo/ }))

    // A escolha continua onde estava. Mudar quem pode ver os relatos por causa de
    // um clique em **outra** pergunta seria decidir no lugar de quem configura.
    expect(
      (screen.getByRole('radio', { name: /Público identificado/ }) as HTMLInputElement).checked,
    ).toBe(true)

    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    // O aviso mora no grupo da visibilidade, e o titulo dele, fechado, ja diz o conflito.
    expect(regiao('Visibilidade').getByText(/o protocolo não identifica ninguém/i)).toBeTruthy()
    expect(resumoDo('visibilidade')).toContain('não combina com o protocolo')
    // O titulo diz por que o Salvar esta desligado, no lugar da conta.
    expect(
      screen.getByText('Escolha uma visibilidade que combine com o protocolo para salvar.'),
    ).toBeTruthy()
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('público diz que nada sai sem passar pela Moderação', async () => {
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Público anônimo/ }))

    expect(screen.getByText(/depois que alguém do time o libera em Moderação/i)).toBeTruthy()
  })

  it('a confirmação mora aqui, e grava na ferramenta com o resto como está agora', async () => {
    const agora = { ...DEFAULT_WIDGET_SETTINGS, LauncherLabel: 'Ajuda' }
    dublê.lerFerramenta.mockResolvedValueOnce(DEFAULT_WIDGET_SETTINGS).mockResolvedValue(agora)
    montar()

    const confirmacao = await screen.findByRole('textbox', {
      name: /Confirmação, acima do protocolo/,
    })
    fireEvent.change(confirmacao, { target: { value: 'Obrigado, {{primeiroNome}}!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvarFerramenta).toHaveBeenCalledTimes(1))
    const enviado = dublê.salvarFerramenta.mock.calls[0]?.[1] as SaveWidgetSettingsRequest
    expect(enviado.SuccessMessage).toBe('Obrigado, {{primeiroNome}}!')
    // O botao, salvo em outra tela, vai como esta agora.
    expect(enviado.LauncherLabel).toBe('Ajuda')
    // So o texto mudou: Quem relata nao e gravado.
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('fechado, cada grupo diz em palavras o que está escolhido', async () => {
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    expect(resumoDo('reconhecimento')).toContain('Protocolo · ninguém é identificado')
    expect(resumoDo('visibilidade')).toContain('Privado · só quem relatou e o time')
    // Os textos, com as variaveis trocadas pelos valores de exemplo.
    expect(resumoDo('depois-de-enviar')).toContain('Recebemos. Anote o protocolo')
    expect(resumoDo('texto-do-acompanhamento')).toContain('Este é o registro do que você enviou.')
    // Sem mudanca, nada de "Mudou".
    expect(resumoDo('reconhecimento')).not.toContain('Mudou')
  })

  it('o aviso público diz que não tem efeito com o projeto privado', async () => {
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    expect(resumoDo('aviso-de-relato-publico')).toContain('Sem efeito: projeto privado')

    // Publico, o titulo passa a mostrar o aviso: agora ele aparece no formulario.
    fireEvent.click(screen.getByRole('radio', { name: /Público anônimo/ }))
    expect(resumoDo('aviso-de-relato-publico')).not.toContain('Sem efeito')
    expect(resumoDo('aviso-de-relato-publico')).toContain('Este relato pode virar público.')
  })

  it('cada grupo volta ao padrão só no rascunho dele', async () => {
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    fireEvent.click(screen.getByRole('radio', { name: /Código pessoal/ }))
    fireEvent.change(screen.getByRole('textbox', { name: /Confirmação, acima do protocolo/ }), {
      target: { value: 'Valeu!' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /Topo da página de acompanhamento/ }), {
      target: { value: 'O seu relato' },
    })

    expect(resumoDo('reconhecimento')).toContain('Mudou: Modo')
    expect(resumoDo('depois-de-enviar')).toContain('Mudou: Texto da confirmação')
    expect(resumoDo('texto-do-acompanhamento')).toContain('Mudou: Texto do topo')
    // Grupo sem mudanca nao oferece voltar.
    expect(regiao('Aviso público').queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()

    // A confirmacao volta, e so ela: o modo e o topo continuam mudados.
    fireEvent.click(regiao('Confirmação').getByRole('button', { name: 'Voltar ao padrão' }))
    expect(
      (
        screen.getByRole('textbox', {
          name: /Confirmação, acima do protocolo/,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe(DEFAULT_WIDGET_SETTINGS.SuccessMessage)
    expect(
      (screen.getByRole('radio', { name: /Código pessoal/ }) as HTMLInputElement).checked,
    ).toBe(true)
    expect(resumoDo('texto-do-acompanhamento')).toContain('Mudou: Texto do topo')

    // O modo volta no rascunho de Quem relata, e o texto do topo fica.
    fireEvent.click(regiao('Reconhecimento').getByRole('button', { name: 'Voltar ao padrão' }))
    expect((screen.getByRole('radio', { name: /Protocolo/ }) as HTMLInputElement).checked).toBe(
      true,
    )
    expect(resumoDo('texto-do-acompanhamento')).toContain('Mudou: Texto do topo')
    expect(salvarLigado()).toBe(true)

    fireEvent.click(
      regiao('Topo do acompanhamento').getByRole('button', { name: 'Voltar ao padrão' }),
    )
    expect(salvarLigado()).toBe(false)
  })

  it('a prévia segue o grupo aberto, até a pessoa escolher uma aba', async () => {
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    // O Reconhecimento abre sozinho e nao tem onde aparecer: a previa fica na confirmacao.
    expect(abaEscolhida()).toBe('No sistema')
    expect(screen.getByText('K7P2-9XQ4')).toBeTruthy()

    detalhesDo('texto-do-acompanhamento').open = true
    await waitFor(() => expect(abaEscolhida()).toBe('Acompanhamento'))
    // A jornada de verdade, na ordem do projeto, com o relato parado na segunda etapa.
    const painel = within(screen.getByRole('tabpanel'))
    expect(await painel.findByText('Recebido')).toBeTruthy()
    expect(painel.getByText('Resolvido')).toBeTruthy()

    detalhesDo('aviso-de-relato-publico').open = true
    await waitFor(() => expect(abaEscolhida()).toBe('Formulário'))
    expect(within(screen.getByRole('tabpanel')).getByText(/Sem aviso/)).toBeTruthy()

    // Escolhida a aba, o foco em outro grupo nao a troca.
    fireEvent.click(screen.getByRole('tab', { name: 'No sistema' }))
    expect(abaEscolhida()).toBe('No sistema')
    act(() => screen.getByRole('textbox', { name: /Topo da página de acompanhamento/ }).focus())
    expect(abaEscolhida()).toBe('No sistema')
    act(() => (document.activeElement as HTMLElement).blur())

    // Abrir outro grupo devolve a conducao a ele.
    detalhesDo('depois-de-enviar').open = true
    detalhesDo('texto-do-acompanhamento').open = false
    detalhesDo('texto-do-acompanhamento').open = true
    await waitFor(() => expect(abaEscolhida()).toBe('Acompanhamento'))
  })

  it('o formulário da prévia mostra o aviso com a frase do nome do nível escolhido', async () => {
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    fireEvent.click(screen.getByRole('radio', { name: /Público anônimo/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Formulário' }))

    const aviso = screen.getByTestId('aviso-no-formulario')
    expect(aviso.textContent).toContain(DEFAULT_WIDGET_SETTINGS.PublicNotice)
    expect(aviso.textContent).toContain('O seu nome nunca aparece.')
  })

  it('as âncoras de sempre continuam existindo', async () => {
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    for (const id of [
      'reconhecimento',
      'visibilidade',
      'depois-de-enviar',
      'confirmacao',
      'mais-opcoes',
      'topo-do-acompanhamento',
      'aviso-publico',
    ]) {
      expect(document.getElementById(id), id).not.toBeNull()
    }
  })

  it('a pergunta do nome e os limites não moram mais aqui, e o endereço antigo leva a eles', async () => {
    const router = montar()
    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(screen.queryByRole('checkbox', { name: /Perguntar o nome/ })).toBeNull()
    expect(screen.queryByText('Limites de relatos')).toBeNull()
    cleanup()

    const doSino = montar('/p/p-1/identity#limites')
    await waitFor(() => expect(doSino.state.location.pathname).toBe('/p/p-1/domains'))
    expect(doSino.state.location.hash).toBe('#limites')
    cleanup()

    const doNome = montar('/p/p-1/identity#perguntar-nome')
    await waitFor(() => expect(doNome.state.location.pathname).toBe('/p/p-1/form-texts'))
    expect(router).toBeTruthy()
  })

  it('manda a visibilidade escolhida junto do modo', async () => {
    dublê.salvar.mockResolvedValue({
      Mode: 'Protocol',
      Visibility: 'PublicAnonymous',
      AsksForName: false,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
    })
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Público anônimo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    expect(dublê.salvar).toHaveBeenCalledWith('p-1', {
      Mode: 'Protocol',
      Visibility: 'PublicAnonymous',
      AsksForName: false,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
    })
  })

  it('a falha ao carregar não mente dizendo que o projeto mudou', async () => {
    dublê.ler.mockRejectedValue(new Error('rede'))
    montar()

    expect(await screen.findByText(/Nada mudou/i)).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
  })
})
