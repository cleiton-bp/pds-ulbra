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
 * Membros e Moderacao; a configuracao vem depois, num grupo recolhivel — "Configurar
 * o projeto" —, fechado no Trabalho e aberto sozinho numa tela de configuracao, e que
 * nao fecha sozinho. Ja foi o contrario: onze telas de configuracao antes do
 * Trabalho, e no celular pequeno o Trabalho ficava fora da gaveta. Os nomes sao os do
 * time (Colunas, Andamento publico, Botao no site, Quem relata, Anexos, Projeto), e
 * os enderecos continuam os de antes — ja foram copiados para conversas. Addons e Uso
 * sairam da lateral.
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
const grupo = () => within(menu()).getByRole('button', { name: 'Configurar o projeto' })

const TRABALHO = ['Trabalho', 'Membros', 'Moderação']
const CONFIGURACAO = [
  'Colunas',
  'Prioridades',
  'Etiquetas',
  'Sprints',
  'Instalação',
  'Chaves',
  'Botão no site',
  'Andamento público',
  'Ciclo',
  'Quem relata',
  'Anexos',
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
    expect(within(menu()).queryByRole('button', { name: 'Configurar o projeto' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Instalação/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Chaves/ })).toBeNull()
  })

  it('para quem administra, o trabalho vem em cima e a configuração embaixo, fechada', async () => {
    abrir('/projects/p-1/reports', [projeto('Administrator', false)])

    expect(await screen.findByText('tela de relatos')).toBeTruthy()
    // Fechada no Trabalho: e o que o time faz todo dia, e o grupo empurrava a lista.
    expect(
      (await screen.findByRole('button', { name: 'Configurar o projeto' })).getAttribute(
        'aria-expanded',
      ),
    ).toBe('false')
    expect(nomesNoMenu()).toEqual(TRABALHO)

    fireEvent.click(grupo())

    expect(grupo().getAttribute('aria-expanded')).toBe('true')
    // Primeiro o que se ajusta depois de comecar (o quadro), depois o que se ajusta
    // uma vez (o site e quem relata), e o projeto em si por ultimo.
    expect(nomesNoMenu()).toEqual([...TRABALHO, ...CONFIGURACAO])
    // O quadro e a segunda vista da tela de Trabalho, e nao uma secao no menu.
    expect(within(menu()).queryByText('Quadro')).toBeNull()
  })

  it('os nomes são os do time, e os endereços continuam os de antes', async () => {
    abrir('/projects/p-1/reports', [projeto('Administrator', true)])
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar o projeto' }))

    const endereco = (nome: string) =>
      within(menu()).getByRole('link', { name: nome }).getAttribute('href')
    expect(endereco('Trabalho')).toBe('/projects/p-1/reports')
    expect(endereco('Colunas')).toBe('/projects/p-1/states')
    expect(endereco('Sprints')).toBe('/projects/p-1/sprints')
    expect(endereco('Botão no site')).toBe('/projects/p-1/tool')
    expect(endereco('Andamento público')).toBe('/projects/p-1/public-stages')
    expect(endereco('Quem relata')).toBe('/projects/p-1/identity')
    expect(endereco('Anexos')).toBe('/projects/p-1/media')
    expect(endereco('Projeto')).toBe('/projects/p-1/settings')

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
    expect(
      (await screen.findByRole('button', { name: 'Configurar o projeto' })).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true')
    expect(within(menu()).getByRole('link', { name: 'Colunas' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })

  it('o grupo não fecha sozinho: voltar ao Trabalho deixa as telas à vista', async () => {
    const { router } = abrir('/projects/p-1/states', [projeto('Administrator', false)])
    await screen.findByRole('button', { name: 'Configurar o projeto' })

    fireEvent.click(within(menu()).getByRole('link', { name: 'Trabalho' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1/reports'))
    expect(grupo().getAttribute('aria-expanded')).toBe('true')
    expect(within(menu()).getByRole('link', { name: 'Colunas' })).toBeTruthy()
  })

  it('chegar a uma tela de configuração por fora do menu também abre o grupo', async () => {
    const { router } = abrir('/projects/p-1/reports', [projeto('Administrator', false)])
    expect(
      (await screen.findByRole('button', { name: 'Configurar o projeto' })).getAttribute(
        'aria-expanded',
      ),
    ).toBe('false')

    await act(() => router.navigate('/projects/p-1/cycle'))

    expect(grupo().getAttribute('aria-expanded')).toBe('true')
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

    const trabalho = within(menu()).getByRole('link', { name: 'Trabalho' })
    expect(trabalho.textContent).toBe('')
    expect(within(menu()).getByRole('button', { name: 'Configurar o projeto' })).toBeTruthy()
    expect(window.localStorage.getItem('pds.web.lateral.recolhida')).toBe('1')

    // Outra visita, no mesmo navegador: a lateral ja abre recolhida.
    cleanup()
    abrir('/projects/p-1/reports', [projeto('Administrator', false)])
    await screen.findByText('tela de relatos')
    fireEvent.click(within(menu()).getByRole('button', { name: 'Abrir o menu' }))
    expect(within(menu()).getByRole('link', { name: 'Trabalho' }).textContent).toBe('Trabalho')
    expect(window.localStorage.getItem('pds.web.lateral.recolhida')).toBe('0')
  })

  it('o título da aba diz a tela e o projeto, sem nome de produto', async () => {
    const { router } = abrir('/projects/p-1/reports', [projeto('Administrator', false)])
    await waitFor(() => expect(document.title).toBe('Trabalho · Loja Online'))

    await act(() => router.navigate('/projects/p-1/states'))
    await waitFor(() => expect(document.title).toBe('Colunas · Loja Online'))

    await act(() => router.navigate('/projects/p-1/public-stages'))
    await waitFor(() => expect(document.title).toBe('Andamento público · Loja Online'))
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
    expect(within(menu()).queryByRole('button', { name: 'Configurar o projeto' })).toBeNull()
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
