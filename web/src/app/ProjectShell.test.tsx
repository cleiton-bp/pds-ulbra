// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectViewModel } from '@/contracts'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A lateral e lida de cima para baixo todo dia.** O Trabalho fica no topo, com
 * Membros e Moderacao; a configuracao vem depois, **num grupo recolhivel** —
 * "Configurar o projeto", um botao que abre e fecha ali mesmo. Dentro, a Visao geral
 * (a pagina central) e as cinco areas (O seu sistema, O formulário, O acompanhamento, O
 * quadro, O time), cada uma com o nome em cima das telas; Membros nao se repete em O
 * time, porque ja esta no topo. O grupo abre fechado no Trabalho, abre sozinho numa
 * tela de configuracao e nao fecha sozinho. Fechado, continua no DOM, mas `inert`.
 * Ja foram treze itens em dois blocos
 * sem rotulo, e antes onze telas antes do Trabalho. Os nomes sao os do time (Colunas,
 * Andamento publico, O botão, Quem relata, Anexos, Domínios, Projeto), e os
 * enderecos continuam os de antes — ja foram copiados para conversas. Chaves, Addons
 * e Uso sairam da lateral; Chaves continua com endereco, e se abre pela Instalacao.
 *
 * Quem e so membro nao ve a configuracao — decidido assim: escondida, e nao
 * travada nem so de leitura. A API recusa o que ele tentasse mudar; mostrar as
 * telas seria convidar a um "salvar" que nunca salva.
 *
 * **Trocar de projeto mantem a tela.** Quem esta em Membros de um projeto e troca
 * pelo seletor quer Membros do outro, e nao a porta dele. A tela de configuracao num
 * projeto em que a pessoa nao administra vira o Trabalho; o card aberto, que e deste
 * projeto, vira a lista do outro.
 *
 * **A gaveta do celular e como um dialogo**: o foco entra nela, Esc fecha, e o foco
 * volta ao botao que abriu. E o titulo da aba diz a tela e o projeto — com dois
 * projetos abertos, as abas iguais nao se distinguiam.
 *
 * O "Projeto nao encontrado" fala de time, e nao de conta: a pessoa pode estar em
 * projetos de varias contas, e "nao pertence a esta conta" deixou de fazer sentido.
 * E na falha o topo continua de pe: marca, sino e conta.
 */
const dublê = vi.hoisted(() => {
  // O tema le a preferencia do sistema ao carregar; o jsdom nao tem matchMedia.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia

  return {
    abrir: vi.fn<(publicId: string) => Promise<ProjectViewModel>>(),
    listar: vi.fn<() => Promise<ProjectViewModel[]>>(),
  }
})

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectService: { ...real.projectService, getProject: dublê.abrir, listProjects: dublê.listar },
  }
})

const { ProjectShell } = await import('@/app/ProjectShell')
const { useProjectsStore } = await import('@/features/projects/projectsStore')
const { PanelError } = await import('@/data/errors')
const { TooltipProvider } = await import('@/shared/components/Tooltip')

function projeto(
  role: ProjectViewModel['Role'],
  dono: boolean,
  mudanca: Partial<ProjectViewModel> = {},
): ProjectViewModel {
  return {
    PublicId: 'p-1',
    Name: 'Loja Online',
    Status: 'Active',
    CreatedAt: '2026-10-01T12:00:00.000Z',
    UpdatedAt: '2026-10-01T12:00:00.000Z',
    Account: { PublicId: 'c-ana', Name: 'Conta da Ana' },
    Role: role,
    IsAccountOwner: dono,
    LastReportReceivedAt: null,
    LastActivityAt: null,
    ...mudanca,
  }
}

/**
 * Abre a casca num endereco. Com `lista`, e ela que a API devolve — na listagem do
 * seletor e ao abrir cada projeto.
 */
function abrir(endereco = '/projects/p-1/reports', lista?: ProjectViewModel[]) {
  if (lista) {
    dublê.listar.mockResolvedValue(lista)
    dublê.abrir.mockImplementation(async (publicId) => {
      const achado = lista.find((item) => item.PublicId === publicId)
      if (!achado) throw new PanelError('Projeto nao encontrado.', 404)
      return achado
    })
  }

  const router = createMemoryRouter(
    [
      {
        path: '/projects/:publicId',
        element: <ProjectShell />,
        children: [
          {
            path: 'reports',
            element: <p>tela de relatos</p>,
            children: [{ path: ':reportPublicId', element: null }],
          },
          { path: '*', element: <p>outra tela</p> },
        ],
      },
      { path: '/projects', element: <p>hub</p> },
    ],
    { initialEntries: [endereco] },
  )
  // O app monta o provedor de dicas em volta de tudo (main.tsx); a lateral
  // recolhida mostra o nome de cada secao numa dica.
  const tela = render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  )
  return { router, ...tela }
}

const menu = () => screen.getByRole('navigation', { name: 'Seções do projeto' })
const nomesNoMenu = () =>
  within(menu())
    .getAllByRole('link')
    .map((link) => link.textContent)
const nomesEm = (onde: HTMLElement) =>
  within(onde)
    .getAllByRole('link')
    .map((link) => link.textContent)
const botaoConfigurar = () => within(menu()).getByRole('button', { name: 'Configurar o projeto' })
/** O grupo que o botao abre; fechado, continua no DOM, mas `inert`. */
const grupoConfigurar = () => document.getElementById('configurar-o-projeto') as HTMLElement
const aberto = () => ({
  botao: botaoConfigurar().getAttribute('aria-expanded'),
  inerte: grupoConfigurar().hasAttribute('inert'),
})
const FECHADO = { botao: 'false', inerte: true }
const ABERTO = { botao: 'true', inerte: false }
const areas = () =>
  within(menu())
    .queryAllByRole('group')
    .map((grupo) => grupo.getAttribute('aria-label'))

const TRABALHO = ['Trabalho', 'Membros', 'Moderação']
/** As cinco areas, no grupo Configurar o projeto. */
const AREAS = ['O seu sistema', 'O formulário', 'O acompanhamento', 'O quadro', 'O time']
/** Sem Membros: ja esta no topo, e repetido em O time seriam dois itens iguais. */
const TELAS_DAS_AREAS = [
  'Instalação',
  'O botão',
  'Domínios',
  'Tipos de relato',
  'Formulário',
  'Anexos',
  'Andamento público',
  'Ciclo',
  'Quem relata',
  'Colunas',
  'Prioridades',
  'Etiquetas',
  'Sprints',
  'Projeto',
]

// O seletor de projeto e um menu do Radix, e o jsdom nao tem o que ele usa para abrir.
instalarRemendosDoRadix()

beforeEach(() => {
  dublê.abrir.mockReset()
  dublê.listar.mockReset()
  useProjectsStore.getState().reset()
  window.localStorage.removeItem('pds.web.lateral.recolhida')
})

afterEach(cleanup)

describe('ProjectShell — o menu', () => {
  it('para quem é só membro, o menu tem o trabalho e não tem a configuração', async () => {
    abrir('/projects/p-1/reports', [projeto('Member', false)])

    expect(await screen.findByText('tela de relatos')).toBeTruthy()
    await waitFor(() => expect(nomesNoMenu()).toEqual(TRABALHO))
    expect(within(menu()).queryByRole('link', { name: 'Configurar o projeto' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Instalação/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Chaves/ })).toBeNull()
  })

  it('para quem administra, no Trabalho o grupo Configurar o projeto começa fechado', async () => {
    abrir('/projects/p-1/reports', [projeto('Administrator', false)])

    expect(await screen.findByText('tela de relatos')).toBeTruthy()
    const botao = await within(menu()).findByRole('button', { name: 'Configurar o projeto' })
    expect(botao.getAttribute('aria-controls')).toBe('configurar-o-projeto')
    // Fechado, o grupo continua no DOM, mas fora do Tab e do leitor de tela.
    expect(aberto()).toEqual(FECHADO)
    expect(nomesNoMenu().slice(0, TRABALHO.length)).toEqual(TRABALHO)
    // O quadro e a segunda vista da tela de Trabalho, e nao uma secao no menu.
    expect(within(menu()).queryByText('Quadro')).toBeNull()
  })

  it('clicar em Configurar o projeto abre a Visão geral e as cinco áreas, e clicar de novo fecha', async () => {
    const { router } = abrir('/projects/p-1/reports', [projeto('Administrator', false)])
    await screen.findByText('tela de relatos')

    fireEvent.click(await within(menu()).findByRole('button', { name: 'Configurar o projeto' }))

    expect(aberto()).toEqual(ABERTO)
    // Abrir o grupo nao navega: a pessoa continua no Trabalho.
    expect(router.state.location.pathname).toBe('/projects/p-1/reports')
    const grupo = grupoConfigurar()
    expect(nomesEm(grupo)).toEqual(['Visão geral', ...TELAS_DAS_AREAS])
    expect(within(grupo).getByRole('link', { name: 'Visão geral' }).getAttribute('href')).toBe(
      '/projects/p-1/configure',
    )
    expect(areas()).toEqual(AREAS)

    const site = within(grupo).getByRole('group', { name: 'O seu sistema' })
    expect(nomesEm(site)).toEqual(['Instalação', 'O botão', 'Domínios'])
    // O nome da area esta a vista, em cima das telas dela.
    expect(within(site).getByText('O seu sistema')).toBeTruthy()
    // Membros fica so no topo: em O time, so o Projeto.
    expect(nomesEm(within(grupo).getByRole('group', { name: 'O time' }))).toEqual(['Projeto'])
    expect(within(menu()).getAllByRole('link', { name: 'Membros' })).toHaveLength(1)

    fireEvent.click(botaoConfigurar())

    expect(aberto()).toEqual(FECHADO)
  })

  it('os nomes são os do time, e os endereços continuam os de antes', async () => {
    abrir('/projects/p-1/configure', [projeto('Administrator', true)])
    await screen.findByText('outra tela')

    const endereco = (nome: string) =>
      within(menu()).getAllByRole('link', { name: nome })[0]?.getAttribute('href')
    expect(endereco('Trabalho')).toBe('/projects/p-1/reports')
    expect(endereco('Instalação')).toBe('/projects/p-1/start')
    expect(endereco('Domínios')).toBe('/projects/p-1/domains')
    expect(endereco('Colunas')).toBe('/projects/p-1/states')
    expect(endereco('Sprints')).toBe('/projects/p-1/sprints')
    expect(endereco('Tipos de relato')).toBe('/projects/p-1/report-types')
    expect(endereco('O botão')).toBe('/projects/p-1/tool')
    expect(endereco('Andamento público')).toBe('/projects/p-1/public-stages')
    expect(endereco('Quem relata')).toBe('/projects/p-1/identity')
    expect(endereco('Anexos')).toBe('/projects/p-1/media')
    expect(endereco('Projeto')).toBe('/projects/p-1/settings')

    // Chaves saiu da lateral: e a parte avancada da Instalacao, e se abre por ela.
    expect(within(menu()).queryByRole('link', { name: 'Chaves' })).toBeNull()

    // Os nomes de quem construiu sairam, e Addons e Uso sairam da lateral.
    for (const antigo of [
      'Estados',
      'Etapas públicas',
      'Ferramenta',
      'Identidade',
      'Mídia',
      'Configurações',
      'Addons',
      'Uso',
    ]) {
      expect(within(menu()).queryByText(antigo)).toBeNull()
    }
  })

  it('numa tela de configuração o grupo abre sozinho, com a tela marcada', async () => {
    abrir('/projects/p-1/states', [projeto('Administrator', false)])

    expect(await screen.findByText('outra tela')).toBeTruthy()
    await within(menu()).findByRole('button', { name: 'Configurar o projeto' })
    expect(aberto()).toEqual(ABERTO)
    expect(within(menu()).getByRole('link', { name: 'Colunas' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(
      within(menu()).getByRole('link', { name: 'Visão geral' }).getAttribute('aria-current'),
    ).toBeNull()
  })

  it('em Chaves, que não tem item próprio, a Instalação fica marcada', async () => {
    abrir('/projects/p-1/keys', [projeto('Administrator', false)])

    expect(await screen.findByText('outra tela')).toBeTruthy()
    await waitFor(() =>
      expect(
        within(menu()).getByRole('link', { name: 'Instalação' }).getAttribute('aria-current'),
      ).toBe('page'),
    )
  })

  it('voltar ao Trabalho não fecha o grupo, e a Visão geral leva à página central', async () => {
    const { router } = abrir('/projects/p-1/states', [projeto('Administrator', false)])
    await screen.findByText('outra tela')
    await within(menu()).findByRole('button', { name: 'Configurar o projeto' })
    expect(aberto()).toEqual(ABERTO)

    fireEvent.click(within(menu()).getByRole('link', { name: 'Trabalho' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1/reports'))
    // Quem estava nas telas quis ve-las: o grupo nao fecha sozinho.
    expect(aberto()).toEqual(ABERTO)

    fireEvent.click(within(menu()).getByRole('link', { name: 'Visão geral' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1/configure'))
    expect(
      within(menu()).getByRole('link', { name: 'Visão geral' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(aberto()).toEqual(ABERTO)
  })

  it('chegar a uma tela de configuração por fora do menu também abre o grupo', async () => {
    const { router } = abrir('/projects/p-1/reports', [projeto('Administrator', false)])
    await within(menu()).findByRole('button', { name: 'Configurar o projeto' })
    expect(aberto()).toEqual(FECHADO)

    await act(() => router.navigate('/projects/p-1/cycle'))

    expect(aberto()).toEqual(ABERTO)
    expect(within(menu()).getByRole('link', { name: 'Ciclo' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })
})

describe('o seletor de projeto', () => {
  const loja = projeto('Administrator', true)
  const lojaMobile = projeto('Member', false, { PublicId: 'p-2', Name: 'Loja Mobile' })

  async function abrirSeletor() {
    // O Radix abre no `pointerdown`, e nao no clique.
    fireEvent.pointerDown(await screen.findByTitle('Loja Online'), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
  }

  async function trocarPara(nome: string) {
    await abrirSeletor()
    fireEvent.click(await screen.findByRole('menuitem', { name: nome }))
  }

  it('marca o projeto aberto, e abre com o foco nele', async () => {
    abrir('/projects/p-1/reports', [lojaMobile, loja])
    await screen.findByText('tela de relatos')
    await waitFor(() => expect(dublê.listar).toHaveBeenCalled())

    await abrirSeletor()

    // O visto e desenho; para o leitor de tela, o "(aberto)".
    // (O jsdom calcula o nome sem o espaco do comeco do texto escondido.)
    const atual = await screen.findByRole('menuitem', { name: /^Loja Online\s*\(aberto\)$/ })
    expect(atual.querySelector('[data-projeto-atual] svg')).toBeTruthy()
    const outro = screen.getByRole('menuitem', { name: 'Loja Mobile' })
    expect(outro.querySelector('[data-projeto-atual]')).toBeNull()
    // Com varios de nome parecido, e do atual que se procura o vizinho.
    await waitFor(() => expect(document.activeElement).toBe(atual))
  })

  it('trocar mantém a tela: de Membros para Membros do outro projeto', async () => {
    const { router } = abrir('/projects/p-1/members', [loja, lojaMobile])
    await screen.findByText('outra tela')

    await trocarPara('Loja Mobile')

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-2/members'))
  })

  it('a tela de configuração, num projeto em que a pessoa não administra, vira o Trabalho', async () => {
    const { router } = abrir('/projects/p-1/states', [loja, lojaMobile])
    await screen.findByText('outra tela')

    await trocarPara('Loja Mobile')

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-2/reports'))
  })

  it('e onde ela também administra, a tela de configuração continua', async () => {
    const outraMinha = projeto('Administrator', true, { PublicId: 'p-3', Name: 'Loja Física' })
    const { router } = abrir('/projects/p-1/start', [loja, outraMinha])
    await screen.findByText('outra tela')

    await trocarPara('Loja Física')

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-3/start'))
  })

  it('o card aberto é deste projeto: do outro, só a lista', async () => {
    const { router } = abrir('/projects/p-1/reports/r-9', [loja, lojaMobile])
    await screen.findByText('tela de relatos')

    await trocarPara('Loja Mobile')

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-2/reports'))
  })
})

describe('a gaveta, a lateral e o título da aba', () => {
  it('a gaveta do celular: o foco entra na seção aberta, Esc fecha e devolve o foco ao botão', async () => {
    abrir('/projects/p-1/reports', [projeto('Member', false)])
    await screen.findByText('tela de relatos')

    const botao = screen.getByRole('button', { name: 'Abrir menu do projeto' })
    expect(botao.getAttribute('aria-controls')).toBe('menu-do-projeto')
    expect(botao.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(botao)

    expect(botao.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Fechar menu' })).toBeTruthy()
    await waitFor(() =>
      expect(document.activeElement).toBe(within(menu()).getByRole('link', { name: 'Trabalho' })),
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('button', { name: 'Fechar menu' })).toBeNull()
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(botao)
  })

  it('o véu fecha a gaveta, e escolher uma seção também', async () => {
    const { router } = abrir('/projects/p-1/reports', [projeto('Member', false)])
    await screen.findByText('tela de relatos')
    const botao = screen.getByRole('button', { name: 'Abrir menu do projeto' })

    fireEvent.click(botao)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar menu' }))
    expect(screen.queryByRole('button', { name: 'Fechar menu' })).toBeNull()
    expect(document.activeElement).toBe(botao)

    fireEvent.click(botao)
    fireEvent.click(within(menu()).getByRole('link', { name: 'Membros' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1/members'))
    expect(screen.queryByRole('button', { name: 'Fechar menu' })).toBeNull()
  })

  it('recolher a lateral deixa só os glifos, com o nome para o leitor de tela, e fica lembrado', async () => {
    abrir('/projects/p-1/reports', [projeto('Administrator', false)])
    await screen.findByText('tela de relatos')

    fireEvent.click(within(menu()).getByRole('button', { name: 'Recolher menu' }))

    // Fechar e um movimento: os nomes esmaecem e so no fim a lateral vira glifos.
    await waitFor(() =>
      expect(within(menu()).getByRole('link', { name: 'Trabalho' }).textContent).toBe(''),
    )
    // O botao do grupo fica so com a seta; o nome vai para o leitor de tela e a dica.
    expect(botaoConfigurar().textContent).toBe('')
    expect(botaoConfigurar().getAttribute('aria-label')).toBe('Configurar o projeto')
    fireEvent.click(botaoConfigurar())
    expect(aberto()).toEqual(ABERTO)
    for (const nome of ['Visão geral', 'Colunas', 'Projeto']) {
      expect(within(grupoConfigurar()).getByRole('link', { name: nome }).textContent).toBe('')
    }
    expect(window.localStorage.getItem('pds.web.lateral.recolhida')).toBe('1')

    // Outra visita, no mesmo navegador: a lateral ja abre recolhida.
    cleanup()
    abrir('/projects/p-1/reports', [projeto('Administrator', false)])
    await screen.findByText('tela de relatos')
    fireEvent.click(within(menu()).getByRole('button', { name: 'Abrir o menu' }))
    expect(within(menu()).getByRole('link', { name: 'Trabalho' }).textContent).toBe('Trabalho')
    expect(window.localStorage.getItem('pds.web.lateral.recolhida')).toBe('0')
  })

  it('recolhida, dentro da configuração, cada área continua com nome para o leitor de tela', async () => {
    window.localStorage.setItem('pds.web.lateral.recolhida', '1')
    abrir('/projects/p-1/tool', [projeto('Administrator', false)])
    await screen.findByText('outra tela')

    await waitFor(() => expect(areas()).toEqual(AREAS))
    const site = within(menu()).getByRole('group', { name: 'O seu sistema' })
    // So os glifos a vista: o nome da area vira um traco, e o da tela, a dica.
    expect(within(site).queryByText('O seu sistema')).toBeNull()
    const botao = within(site).getByRole('link', { name: 'O botão' })
    expect(botao.textContent).toBe('')
    expect(botao.getAttribute('aria-current')).toBe('page')
  })

  it('o título da aba diz a tela e o projeto, sem nome de produto', async () => {
    const { router } = abrir('/projects/p-1/reports', [projeto('Administrator', false)])
    await waitFor(() => expect(document.title).toBe('Trabalho · Loja Online'))

    await act(() => router.navigate('/projects/p-1/states'))
    await waitFor(() => expect(document.title).toBe('Colunas · Loja Online'))

    await act(() => router.navigate('/projects/p-1/public-stages'))
    await waitFor(() => expect(document.title).toBe('Andamento público · Loja Online'))

    await act(() => router.navigate('/projects/p-1/configure'))
    await waitFor(() => expect(document.title).toBe('Configurar o projeto · Loja Online'))

    // Chaves nao tem item na lateral, e a aba continua dizendo onde a pessoa esta.
    await act(() => router.navigate('/projects/p-1/keys'))
    await waitFor(() => expect(document.title).toBe('Chaves · Loja Online'))
  })

  // O card aberto escreve o proprio titulo; a casca nao pode passar por cima.
  it('com o card aberto, a casca não escreve o título', async () => {
    document.title = 'título do card'
    abrir('/projects/p-1/reports/r-9', [projeto('Administrator', false)])
    await screen.findByText('tela de relatos')
    await waitFor(() => expect(dublê.listar).toHaveBeenCalled())

    expect(document.title).toBe('título do card')
  })

  it('"Pular para o conteúdo" é o primeiro link, e leva ao conteúdo', async () => {
    abrir('/projects/p-1/reports', [projeto('Member', false)])
    await screen.findByText('tela de relatos')

    const pular = screen.getAllByRole('link')[0] as HTMLElement
    expect(pular.textContent).toBe('Pular para o conteúdo')
    expect(pular.getAttribute('href')).toBe('#conteudo')
    expect(document.getElementById('conteudo')?.tagName).toBe('MAIN')
  })
})

describe('carregando e falhando', () => {
  it('enquanto o projeto carrega, o Trabalho já está no lugar, e a configuração não pula', async () => {
    dublê.abrir.mockReturnValue(new Promise(() => {}))
    dublê.listar.mockReturnValue(new Promise(() => {}))
    abrir()

    expect(nomesNoMenu()).toEqual(TRABALHO)
    expect(within(menu()).queryByRole('link', { name: 'Configurar o projeto' })).toBeNull()
  })

  it('projeto em que a pessoa não está: fala de time, e não de conta', async () => {
    dublê.abrir.mockRejectedValue(new PanelError('Projeto nao encontrado.', 404))
    dublê.listar.mockResolvedValue([])
    abrir()

    expect(await screen.findByText('Projeto não encontrado')).toBeTruthy()
    expect(screen.getByText('Ele não existe, ou você não está no time dele.')).toBeTruthy()
    // O topo continua de pe: a marca leva aos projetos, e a conta e o sino seguem ali.
    expect(screen.getByTitle('Ir para os projetos').getAttribute('href')).toBe('/projects')
    expect(screen.getByRole('button', { name: 'Conta' })).toBeTruthy()
    // Sem projeto, nao ha menu de projeto para abrir.
    expect(screen.queryByRole('button', { name: 'Abrir menu do projeto' })).toBeNull()
    // "Tentar de novo" daria a mesma resposta.
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('falha ao consultar: diz que nada mudou no projeto, e tentar de novo abre', async () => {
    dublê.abrir
      .mockRejectedValueOnce(new PanelError('Erro ao processar a requisicao.', 500))
      .mockResolvedValue(projeto('Member', false))
    dublê.listar.mockResolvedValue([projeto('Member', false)])
    abrir()

    expect(await screen.findByText('Não deu para abrir este projeto')).toBeTruthy()
    expect(
      screen.getByText('A falha foi ao consultar, e não no projeto: nada mudou nele.'),
    ).toBeTruthy()
    expect(screen.getByTitle('Ir para os projetos')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByText('tela de relatos')).toBeTruthy()
  })
})
