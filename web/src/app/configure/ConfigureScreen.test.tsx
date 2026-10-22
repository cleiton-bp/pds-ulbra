// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ObservedOriginViewModel,
  ProjectInvitationsViewModel,
  ProjectOriginViewModel,
  ProjectViewModel,
  TeamMemberViewModel,
  WidgetSettingsViewModel,
} from '@/contracts'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A pagina se entende de cima para baixo**: o titulo, a busca logo embaixo, os
 * primeiros passos e tudo o que da para ajustar.
 *
 * **Os primeiros passos mostram so o proximo**, com o porque e a acao; a barra diz
 * "n de 5"; os feitos ficam numa linha de confirmacoes; a lista inteira esta a um
 * clique ("Ver todos os passos"), e a escolha fica guardada por projeto. Cada passo e
 * conferido pelos dados — nenhum e uma caixa que a pessoa marca:
 * - script colado: um relato de um endereco que nao e o painel;
 * - dominio autorizado: a lista de autorizados tem alguem;
 * - relato de teste: um relato com o endereco do painel;
 * - botao escolhido: cor, canto, texto ou icone fora do padrao;
 * - time convidado: duas pessoas, ou um convite aberto.
 * "Quem pode ver" e passo opcional, so na lista inteira e fora da conta. Tudo feito,
 * o cartao diz "Tudo pronto", e ver os passos de novo e um clique.
 *
 * **O dominio se autoriza ali mesmo**, e o que mandou relato e esta esperando aparece
 * pronto, com um botao. Depois de autorizar, a pagina rele.
 *
 * **A busca acha por sinonimo e sem acento**, anda pelas setas, abre com Enter e leva a
 * `tela#campo` pedindo o realce; Esc fecha a lista.
 *
 * **Cada tela das areas e um link com o nome**, e o resumo do que ja foi lido fica na
 * linha de baixo, ligado ao link como descricao — sem leitura a mais.
 */
const dublê = vi.hoisted(() => ({
  autorizados: vi.fn<() => Promise<ProjectOriginViewModel[]>>(),
  observados: vi.fn<() => Promise<ObservedOriginViewModel[]>>(),
  autorizar: vi.fn(),
  botao: vi.fn<() => Promise<WidgetSettingsViewModel>>(),
  membros: vi.fn<() => Promise<TeamMemberViewModel[]>>(),
  convites: vi.fn<() => Promise<ProjectInvitationsViewModel>>(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectOriginService: {
      ...real.projectOriginService,
      listProjectOrigins: dublê.autorizados,
      listObservedOrigins: dublê.observados,
      addProjectOrigin: dublê.autorizar,
    },
    projectWidgetSettingsService: {
      ...real.projectWidgetSettingsService,
      getWidgetSettings: dublê.botao,
    },
    projectTeamService: {
      ...real.projectTeamService,
      listMembers: dublê.membros,
      listInvitations: dublê.convites,
    },
  }
})

const { ConfigureScreen } = await import('@/app/configure/ConfigureScreen')
const { PanelError } = await import('@/data/errors')

const AGORA = '2026-10-09T12:00:00.000Z'
/** O endereco do painel no jsdom: e com ele que o relato de teste chega. */
const PAINEL = window.location.host

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: AGORA,
  UpdatedAt: AGORA,
  Account: { PublicId: 'c-1', Name: 'Conta da Ana' },
  Role: 'Administrator',
  IsAccountOwner: true,
  LastReportReceivedAt: null,
  LastActivityAt: null,
}

function observado(Domain: string, Status: ObservedOriginViewModel['Status']) {
  return {
    Domain,
    ReportCount: 1,
    LastReportAt: AGORA,
    Status,
    MarkedCount: 0,
    BlockedOriginId: null,
  }
}

function autorizado(Domain: string): ProjectOriginViewModel {
  return { PublicId: `o-${Domain}`, Domain, AllowsSubdomains: false, CreatedAt: AGORA }
}

function pessoa(nome: string): TeamMemberViewModel {
  return {
    UserPublicId: `u-${nome}`,
    Name: nome,
    Email: `${nome}@loja.com`,
    AvatarUrl: null,
    Role: 'Administrator',
    IsAccountOwner: false,
    IsYou: false,
    JoinedAt: AGORA,
  }
}

const SEM_CONVITES: ProjectInvitationsViewModel = {
  Items: [],
  CanInvite: true,
  UnavailableReason: null,
  ValidityDays: 7,
  MaxPerHour: 20,
}

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/projects/:publicId',
        element: <Outlet context={{ project: projeto }} />,
        children: [
          { path: 'configure', element: <ConfigureScreen /> },
          { path: '*', element: <p>outra tela</p> },
        ],
      },
    ],
    { initialEntries: ['/projects/p-1/configure'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const passos = () => screen.getByRole('region', { name: 'Primeiros passos' })
const barra = () => within(passos()).getByRole('progressbar', { name: 'Primeiros passos feitos' })
/** O passo aberto: o titulo dele e o unico titulo de nivel 3 do cartao. */
const proximo = () => within(passos()).getByRole('heading', { level: 3 }).textContent
/** A linha dos passos feitos, no cartao recolhido. */
const feitos = () =>
  within(within(passos()).getByRole('list', { name: 'Passos feitos' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent?.replace('·', '').trim())
/** O titulo de cada passo da lista inteira, com o "(feito)" ou "(a fazer)" que o leitor de tela ouve. */
const titulos = () =>
  within(passos())
    .getAllByRole('listitem')
    .map((item) => item.querySelector('p')?.textContent)
const destino = (nome: string) =>
  within(passos()).getByRole('link', { name: nome }).getAttribute('href')

beforeEach(() => {
  dublê.autorizados.mockResolvedValue([])
  dublê.observados.mockResolvedValue([])
  dublê.botao.mockResolvedValue(DEFAULT_WIDGET_SETTINGS)
  dublê.membros.mockResolvedValue([pessoa('ana')])
  dublê.convites.mockResolvedValue(SEM_CONVITES)
  try {
    window.localStorage.removeItem('pds.web.primeirosPassos.p-1')
  } catch {
    // Sem armazenamento, nada a limpar.
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Configurar o projeto — a ordem da página', () => {
  it('o título, a busca logo embaixo, os primeiros passos e tudo o que dá para ajustar', async () => {
    montar()

    const titulo = screen.getByRole('heading', { level: 1, name: 'Configurar o projeto' })
    const busca = screen.getByRole('combobox', { name: 'Procurar nas configurações' })
    await waitFor(() => expect(passos()).toBeTruthy())
    const ajustes = screen.getByRole('heading', { level: 2, name: 'Tudo o que dá para ajustar' })

    const depois = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(depois(titulo, busca)).toBe(true)
    expect(depois(busca, passos())).toBe(true)
    expect(depois(passos(), ajustes)).toBe(true)
    expect(screen.queryByRole('heading', { name: 'Áreas' })).toBeNull()
  })
})

describe('Configurar o projeto — os primeiros passos', () => {
  it('projeto novo: 0 de 5, e só o próximo passo aberto, com o porquê e a ação', async () => {
    montar()

    await waitFor(() => expect(within(passos()).getByText('0 de 5')).toBeTruthy())
    expect(barra().getAttribute('aria-valuenow')).toBe('0')
    expect(barra().getAttribute('aria-valuemin')).toBe('0')
    expect(barra().getAttribute('aria-valuemax')).toBe('5')

    expect(within(passos()).getByText('Próximo passo')).toBeTruthy()
    expect(proximo()).toBe('Colar o script no seu sistema')
    expect(
      within(passos()).getByText(
        'É ele que põe o botão de relato no seu sistema (site ou aplicação).',
      ),
    ).toBeTruthy()
    expect(destino('Ver o script')).toBe('/projects/p-1/start#script')

    // Os outros passos, o campo do dominio e o opcional ficam na lista inteira.
    expect(within(passos()).queryByText('Convidar o time')).toBeNull()
    expect(within(passos()).queryByRole('textbox')).toBeNull()
    expect(within(passos()).queryByText(/quem pode ver/i)).toBeNull()
    expect(within(passos()).queryByRole('list', { name: 'Passos feitos' })).toBeNull()

    const alternar = within(passos()).getByRole('button', { name: 'Ver todos os passos' })
    expect(alternar.getAttribute('aria-expanded')).toBe('false')
  })

  it('os feitos numa linha só, e o próximo é o primeiro que falta', async () => {
    dublê.autorizados.mockResolvedValue([autorizado('loja.com')])
    dublê.observados.mockResolvedValue([observado('loja.com', 'Allowed')])
    dublê.botao.mockResolvedValue({ ...DEFAULT_WIDGET_SETTINGS, Position: 'TopLeft' })
    montar()

    await waitFor(() => expect(within(passos()).getByText('3 de 5')).toBeTruthy())
    expect(barra().getAttribute('aria-valuenow')).toBe('3')
    expect(feitos()).toEqual(['Script colado', 'Domínio autorizado', 'Botão'])
    expect(proximo()).toBe('Enviar um relato de teste')
    expect(destino('Fazer o teste')).toBe('/projects/p-1/start#relato-de-teste')
  })

  it('o relato de teste não conta como script colado: só o do site', async () => {
    dublê.observados.mockResolvedValue([observado(PAINEL, 'Allowed')])
    montar()

    await waitFor(() => expect(within(passos()).getByText('1 de 5')).toBeTruthy())
    expect(feitos()).toEqual(['Relato de teste'])
    expect(proximo()).toBe('Colar o script no seu sistema')
  })

  it('um convite aberto também conta como time convidado', async () => {
    dublê.convites.mockResolvedValue({
      ...SEM_CONVITES,
      Items: [
        {
          PublicId: 'i-1',
          Email: 'bia@loja.com',
          Role: 'Member',
          InvitedByName: 'Ana',
          CreatedAt: AGORA,
          ExpiresAt: AGORA,
          IsExpired: false,
          EmailStatus: 'Sent',
          EmailSentAt: AGORA,
        },
      ],
    })
    montar()

    await waitFor(() => expect(feitos()).toEqual(['Time convidado']))
  })

  it('"Ver todos os passos" abre a lista inteira, com o opcional fora da conta, e lembra', async () => {
    montar()

    await waitFor(() => expect(within(passos()).getByText('0 de 5')).toBeTruthy())
    fireEvent.click(within(passos()).getByRole('button', { name: 'Ver todos os passos' }))

    expect(titulos()).toEqual([
      'Colar o script no seu sistema (a fazer)',
      'Autorizar o endereço do seu sistema (a fazer)',
      'Enviar um relato de teste (a fazer)',
      'Escolher a cor e o texto do botão (a fazer)',
      'Convidar o time (a fazer)',
      'Escolher quem pode ver os relatos opcional',
    ])
    expect(
      screen.getByText('Sem isso, o relato que chega do seu sistema fica retido até você liberar.'),
    ).toBeTruthy()
    expect(destino('Ver o script')).toBe('/projects/p-1/start#script')
    expect(destino('Abrir Domínios')).toBe('/projects/p-1/domains#autorizados')
    expect(destino('Fazer o teste')).toBe('/projects/p-1/start#relato-de-teste')
    expect(destino('Ajustar o botão')).toBe('/projects/p-1/tool#cor-do-botao')
    expect(destino('Convidar')).toBe('/projects/p-1/members#convidar')

    // Quem pode ver: opcional, com o valor de hoje, e fora do "n de 5".
    expect(within(passos()).getByText('Hoje: só o time vê os relatos.')).toBeTruthy()
    expect(destino('Abrir Quem relata')).toBe('/projects/p-1/identity#visibilidade')
    expect(within(passos()).getByText('0 de 5')).toBeTruthy()
    expect(barra().getAttribute('aria-valuemax')).toBe('5')
    expect(window.localStorage.getItem('pds.web.primeirosPassos.p-1')).toBe('aberto')

    // A escolha fica guardada por projeto: voltar a pagina abre do mesmo jeito.
    cleanup()
    montar()
    await waitFor(() => expect(titulos()).toHaveLength(6))

    const esconder = within(passos()).getByRole('button', { name: 'Esconder' })
    expect(esconder.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(esconder)

    expect(proximo()).toBe('Colar o script no seu sistema')
    expect(within(passos()).queryByText('Convidar o time')).toBeNull()
    expect(window.localStorage.getItem('pds.web.primeirosPassos.p-1')).toBe('fechado')
  })

  it('tudo feito: o cartão diz "Tudo pronto", e dá para ver os passos de novo', async () => {
    dublê.autorizados.mockResolvedValue([autorizado('loja.com')])
    dublê.observados.mockResolvedValue([
      observado('loja.com', 'Allowed'),
      observado(PAINEL, 'Allowed'),
    ])
    dublê.botao.mockResolvedValue({ ...DEFAULT_WIDGET_SETTINGS, LauncherLabel: 'Achou um erro?' })
    dublê.membros.mockResolvedValue([pessoa('ana'), pessoa('bia')])
    montar()

    await waitFor(() => expect(within(passos()).getByText('Tudo pronto')).toBeTruthy())
    expect(barra().getAttribute('aria-valuenow')).toBe('5')
    expect(within(passos()).queryByRole('list')).toBeNull()
    expect(within(passos()).queryByText('Próximo passo')).toBeNull()
    // Com duas pessoas, os convites nao mudam nada: nem sao lidos.
    expect(dublê.convites).not.toHaveBeenCalled()

    fireEvent.click(within(passos()).getByRole('button', { name: 'Ver os passos' }))

    const lista = titulos()
    expect(lista.slice(0, 5).every((titulo) => titulo?.endsWith('(feito)'))).toBe(true)
    expect(lista[5]).toBe('Escolher quem pode ver os relatos opcional')
    expect(window.localStorage.getItem('pds.web.primeirosPassos.p-1')).toBe('aberto')
  })

  it('o domínio que mandou relato aparece pronto no próximo passo, e autorizar relê a página', async () => {
    dublê.observados.mockResolvedValue([observado('loja.com', 'Unlisted')])
    dublê.autorizar.mockResolvedValue(autorizado('loja.com'))
    montar()

    await waitFor(() => expect(within(passos()).getByText('1 de 5')).toBeTruthy())
    expect(proximo()).toBe('Autorizar o endereço do seu sistema')
    expect(within(passos()).getByText(/mandou relato e está esperando/)).toBeTruthy()
    expect(within(passos()).getByRole('textbox', { name: 'Domínio do seu sistema' })).toBeTruthy()

    dublê.autorizados.mockResolvedValue([autorizado('loja.com')])
    dublê.observados.mockResolvedValue([observado('loja.com', 'Allowed')])
    fireEvent.click(within(passos()).getByRole('button', { name: 'Autorizar loja.com' }))

    await waitFor(() =>
      expect(dublê.autorizar).toHaveBeenCalledWith('p-1', {
        Domain: 'loja.com',
        AllowsSubdomains: false,
      }),
    )
    await waitFor(() => expect(within(passos()).getByText('2 de 5')).toBeTruthy())
    expect(feitos()).toEqual(['Script colado', 'Domínio autorizado'])
    expect(proximo()).toBe('Enviar um relato de teste')
    expect(within(passos()).queryByText(/está esperando/)).toBeNull()
  })

  it('autorizar pelo campo da lista inteira: o erro fica no campo, onde há o que corrigir', async () => {
    dublê.autorizar.mockRejectedValue(new PanelError('Endereco invalido.', 400))
    montar()

    fireEvent.click(
      await within(await screen.findByRole('region', { name: 'Primeiros passos' })).findByRole(
        'button',
        { name: 'Ver todos os passos' },
      ),
    )
    const campo = within(passos()).getByRole('textbox', { name: 'Domínio do seu sistema' })
    fireEvent.change(campo, { target: { value: 'loja exemplo' } })
    fireEvent.click(within(passos()).getByRole('button', { name: 'Autorizar' }))

    await waitFor(() => expect(campo.getAttribute('aria-invalid')).toBe('true'))
    expect(dublê.autorizar).toHaveBeenCalledWith('p-1', {
      Domain: 'loja exemplo',
      AllowsSubdomains: false,
    })
  })
})

describe('Configurar o projeto — a busca', () => {
  it('acha sem acento, anda pelas setas e Enter leva ao campo, pedindo o realce', async () => {
    const router = montar()
    const busca = screen.getByRole('combobox', { name: 'Procurar nas configurações' })

    fireEvent.focus(busca)
    fireEvent.change(busca, { target: { value: 'dominio autorizado' } })

    const lista = screen.getByRole('listbox', { name: 'Opções encontradas' })
    const opcao = within(lista).getByRole('option', { name: /Domínios autorizados/ })
    expect(opcao.textContent).toContain('O seu sistema · Domínios')
    expect(busca.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(busca, { key: 'ArrowDown' })
    expect(busca.getAttribute('aria-activedescendant')).toBe(opcao.id)
    expect(opcao.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(busca, { key: 'Enter' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1/domains'))
    expect(router.state.location.hash).toBe('#autorizados')
    expect(router.state.location.state).toEqual({ realce: true })
  })

  it('acha por sinônimo, e o clique também leva', async () => {
    const router = montar()
    const busca = screen.getByRole('combobox', { name: 'Procurar nas configurações' })

    fireEvent.focus(busca)
    fireEvent.change(busca, { target: { value: 'spam' } })
    fireEvent.click(screen.getByRole('option', { name: /Limites de relatos/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1/domains'))
    expect(router.state.location.hash).toBe('#limites')
  })

  it('Esc fecha a lista; com ela fechada, limpa o campo. Nada achado é dito', async () => {
    montar()
    const busca = screen.getByRole('combobox', {
      name: 'Procurar nas configurações',
    }) as HTMLInputElement

    fireEvent.focus(busca)
    fireEvent.change(busca, { target: { value: 'xyzw' } })
    expect(screen.getByRole('status').textContent).toContain('Nenhuma opção com “xyzw”')

    fireEvent.change(busca, { target: { value: 'cor' } })
    expect(screen.getByRole('listbox')).toBeTruthy()

    fireEvent.keyDown(busca, { key: 'Escape' })
    expect(busca.getAttribute('aria-expanded')).toBe('false')
    expect(busca.value).toBe('cor')

    fireEvent.keyDown(busca, { key: 'Escape' })
    expect(busca.value).toBe('')
  })
})

describe('Configurar o projeto — tudo o que dá para ajustar', () => {
  it('cada tela é um link com o nome, e o resumo fica na linha de baixo, como descrição', async () => {
    dublê.membros.mockResolvedValue([pessoa('ana'), pessoa('bia')])
    montar()

    const site = screen.getByRole('region', { name: 'O seu sistema' })
    const botao = within(site).getByRole('link', { name: 'O botão' })
    expect(botao.getAttribute('href')).toBe('/projects/p-1/tool')

    await waitFor(() =>
      expect(
        within(site).getByRole('link', {
          name: 'O botão',
          description: '“Relatar”, embaixo, à direita',
        }),
      ).toBeTruthy(),
    )
    // O resumo e um elemento proprio, depois do nome — e nao um pedaco da mesma linha.
    const resumo = document.getElementById(botao.getAttribute('aria-describedby') ?? '')
    const nome = within(botao).getByText('O botão')
    expect(resumo?.textContent).toBe('“Relatar”, embaixo, à direita')
    expect(resumo?.parentElement).toBe(nome.parentElement)
    expect(resumo?.className).not.toContain('truncate')
    expect(
      Boolean(nome.compareDocumentPosition(resumo as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true)

    expect(
      within(site).getByRole('link', { name: 'Domínios', description: 'Nenhum autorizado' }),
    ).toBeTruthy()

    const time = screen.getByRole('region', { name: 'O time' })
    expect(
      within(time).getByRole('link', { name: 'Membros', description: '2 pessoas' }),
    ).toBeTruthy()

    // Tela sem resumo: so o nome, sem descricao pendurada.
    const anexos = screen.getByRole('link', { name: 'Anexos' })
    expect(anexos.getAttribute('aria-describedby')).toBeNull()

    expect(
      screen.getAllByRole('region').map((regiao) => regiao.getAttribute('aria-labelledby')),
    ).toHaveLength(6)
  })
})
