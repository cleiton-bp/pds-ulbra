// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HeldOriginViewModel,
  ObservedOriginViewModel,
  ProjectKeyViewModel,
  ProjectOriginViewModel,
  ProjectViewModel,
  WidgetSettingsViewModel,
} from '@/contracts'
import { StartScreen } from '@/features/onboarding/StartScreen'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Um passo aberto, e e o que falta.** A tela e um acordeao, e quem decide o passo
 * aberto sao os dados — relato de fora, lista de autorizados, relato do painel —, nao
 * uma caixa de marcar. Com tudo feito, nada abre: quem volta ve os titulos e o selo.
 *
 * **O botao do passo funciona com ele fechado.** Copiar o bloco pelo titulo nao pode
 * abrir nem fechar o passo.
 *
 * **Autorizar sem sair da tela**, com a contagem do que a lista tem hoje.
 *
 * **As ancoras da busca continuam de pe**: `copiar-chave`, `script`, `relato-de-teste`,
 * `proprio-botao` e `mais-opcoes` sao enderecos que a busca e a pagina central usam.
 *
 * **Os links usam os nomes do menu** (Domínios, O botão, Chaves): uma frase dizendo
 * "mudar em Ferramenta" mandava procurar uma tela que nao existe mais com esse nome.
 */
const dublê = vi.hoisted(() => ({
  chaves: vi.fn<() => Promise<ProjectKeyViewModel[]>>(),
  autorizados: vi.fn<() => Promise<ProjectOriginViewModel[]>>(),
  observados: vi.fn<() => Promise<ObservedOriginViewModel[]>>(),
  aguardando: vi.fn<() => Promise<HeldOriginViewModel[]>>(),
  autorizar: vi.fn<(id: string, request: unknown) => Promise<ProjectOriginViewModel>>(),
  botao: vi.fn<() => Promise<WidgetSettingsViewModel>>(),
  copiar: vi.fn<(texto: string) => Promise<boolean>>(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectKeyService: { ...real.projectKeyService, listProjectKeys: dublê.chaves },
    projectOriginService: {
      ...real.projectOriginService,
      listProjectOrigins: dublê.autorizados,
      listObservedOrigins: dublê.observados,
      listPendingOrigins: dublê.aguardando,
      addProjectOrigin: dublê.autorizar,
    },
    projectWidgetSettingsService: {
      ...real.projectWidgetSettingsService,
      getWidgetSettings: dublê.botao,
    },
  }
})

vi.mock('@/shared/lib/clipboard', () => ({ copyText: dublê.copiar }))

function projeto(ultimoRelato: string | null): ProjectViewModel {
  return {
    PublicId: 'p-1',
    Name: 'Loja',
    Status: 'Active',
    CreatedAt: '2026-10-01T12:00:00.000Z',
    UpdatedAt: '2026-10-01T12:00:00.000Z',
    Account: { PublicId: 'c-1', Name: 'Conta da Ana' },
    Role: 'Administrator',
    IsAccountOwner: true,
    LastReportReceivedAt: ultimoRelato,
    LastActivityAt: ultimoRelato,
  }
}

const PUBLICA: ProjectKeyViewModel = {
  PublicId: 'k-1',
  Type: 'Public',
  Value: 'pk_live_loja123',
  Prefix: 'pk_live_',
  IsActive: true,
  CreatedAt: '2026-10-01T12:00:00.000Z',
  RevokedAt: null,
  LastUsedAt: null,
}

function autorizado(domain: string): ProjectOriginViewModel {
  return { PublicId: `o-${domain}`, Domain: domain, AllowsSubdomains: false, CreatedAt: '' }
}

function observado(domain: string): ObservedOriginViewModel {
  return {
    Domain: domain,
    ReportCount: 1,
    LastReportAt: '2026-10-09T12:00:00.000Z',
    Status: 'Unlisted',
    MarkedCount: 0,
    BlockedOriginId: null,
  }
}

/** O relato de teste chega com o endereco do painel. */
const PAINEL = () => observado(window.location.host.toLowerCase())

function montar(project: ProjectViewModel) {
  const router = createMemoryRouter(
    [
      {
        path: '/projects/:publicId',
        element: <Outlet context={{ project }} />,
        children: [
          { path: 'start', element: <StartScreen /> },
          { path: '*', element: <p>outra tela</p> },
        ],
      },
    ],
    { initialEntries: ['/projects/p-1/start'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

/** O `<details>` do passo: a ancora mora no `<summary>` dele. */
const passo = (id: string) => document.getElementById(id)?.closest('details') as HTMLDetailsElement

const abertos = () =>
  ['script', 'autorizar-endereco', 'relato-de-teste'].filter((id) => passo(id).open)

const pronta = () => screen.findByRole('heading', { name: 'Colar o script no seu sistema' })

describe('StartScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const dublo of Object.values(dublê)) dublo.mockReset()
    dublê.chaves.mockResolvedValue([PUBLICA])
    dublê.autorizados.mockResolvedValue([])
    dublê.observados.mockResolvedValue([])
    dublê.aguardando.mockResolvedValue([])
    dublê.botao.mockRejectedValue(new Error('sem leitura'))
    dublê.copiar.mockResolvedValue(true)
  })

  it('diz os três passos, com a chave pública no script', async () => {
    montar(projeto(null))

    expect(
      screen.getByText(
        'Três passos para o seu sistema (site ou aplicação) começar a mandar relatos para este projeto.',
      ),
    ).toBeTruthy()
    await pronta()
    expect(
      screen.getByRole('heading', { name: 'Autorizar o endereço do seu sistema' }),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Fazer um relato de teste' })).toBeTruthy()
    expect(document.querySelector('pre')?.textContent).toContain('pk_live_loja123')
    // A chave, numa linha, com o proprio Copiar: o antigo primeiro passo.
    expect(document.getElementById('copiar-chave')?.textContent).toContain('pk_live_loja123')
  })

  it('mantém as âncoras que a busca e a página central usam', async () => {
    montar(projeto(null))
    await pronta()

    for (const id of ['copiar-chave', 'script', 'relato-de-teste', 'proprio-botao', 'mais-opcoes'])
      expect(document.getElementById(id), id).not.toBeNull()
    // A ancora do passo fica dentro do `<details>`: e assim que a busca o abre.
    expect(document.getElementById('script')?.tagName).toBe('SUMMARY')
  })

  it('sem nada feito, abre o primeiro passo e diz o que falta', async () => {
    montar(projeto(null))
    await pronta()

    expect(abertos()).toEqual(['script'])
    // Cada passo diz o que ainda nao aconteceu, e nao so "falta".
    expect(document.getElementById('script')?.textContent).toContain(
      'Ainda não chegou relato do seu sistema',
    )
    expect(document.getElementById('autorizar-endereco')?.textContent).toContain(
      'Nenhum endereço autorizado',
    )
    expect(document.getElementById('relato-de-teste')?.textContent).toContain('Ainda não testado')
  })

  it('o passo aberto segue os dados: com o script colado, abre o do endereço', async () => {
    dublê.observados.mockResolvedValue([observado('loja.exemplo.com')])
    montar(projeto('2026-10-09T12:00:00.000Z'))
    await pronta()

    await waitFor(() => expect(abertos()).toEqual(['autorizar-endereco']))
    expect(document.getElementById('script')?.textContent).toContain('Feito')
  })

  it('com o script e o endereço, abre o teste — o relato do painel não conta como script', async () => {
    dublê.observados.mockResolvedValue([observado('loja.exemplo.com')])
    dublê.autorizados.mockResolvedValue([autorizado('loja.exemplo.com')])
    montar(projeto('2026-10-09T12:00:00.000Z'))
    await pronta()
    await waitFor(() => expect(abertos()).toEqual(['relato-de-teste']))

    cleanup()
    // So o relato de teste chegou: o script continua faltando.
    dublê.observados.mockResolvedValue([PAINEL()])
    montar(projeto('2026-10-09T12:00:00.000Z'))
    await pronta()
    await waitFor(() => expect(abertos()).toEqual(['script']))
    expect(document.getElementById('relato-de-teste')?.textContent).toContain('Feito')
  })

  it('sem relato de fora ainda, não diz que está funcionando', async () => {
    montar(projeto(null))
    await pronta()

    expect(screen.queryByText(/Funcionando/)).toBeNull()
  })

  it('com tudo feito, os passos ficam fechados e o selo diz que funciona', async () => {
    dublê.observados.mockResolvedValue([observado('loja.exemplo.com'), PAINEL()])
    dublê.autorizados.mockResolvedValue([autorizado('loja.exemplo.com')])
    const router = montar(projeto(new Date(Date.now() - 5 * 60 * 1000).toISOString()))
    await pronta()

    const selo = await screen.findByRole('status')
    expect(selo.textContent).toMatch(/^Funcionando · último relato há 5 minutos/)
    expect(abertos()).toEqual([])
    for (const id of ['script', 'autorizar-endereco', 'relato-de-teste'])
      expect(document.getElementById(id)?.textContent).toContain('Feito')

    fireEvent.click(within(selo).getByRole('link', { name: 'Ver em Trabalho' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1/reports'))
  })

  it('copia o bloco pelo título, sem abrir o passo', async () => {
    dublê.observados.mockResolvedValue([observado('loja.exemplo.com')])
    montar(projeto('2026-10-09T12:00:00.000Z'))
    await pronta()
    await waitFor(() => expect(passo('script').open).toBe(false))

    const titulo = document.getElementById('script') as HTMLElement
    fireEvent.click(within(titulo).getByRole('button', { name: 'Copiar bloco' }))

    await waitFor(() => expect(dublê.copiar).toHaveBeenCalledTimes(1))
    expect(dublê.copiar.mock.calls[0]?.[0]).toContain('pk_live_loja123')
    expect(passo('script').open).toBe(false)
  })

  it('conta autorizados e aguardando, e autoriza o endereço dali mesmo', async () => {
    dublê.observados.mockResolvedValue([observado('loja.exemplo.com')])
    dublê.autorizados.mockResolvedValue([autorizado('a.exemplo.com'), autorizado('b.exemplo.com')])
    dublê.aguardando.mockResolvedValue([
      { Domain: 'loja.exemplo.com', ReportCount: 2, LastReportAt: '2026-10-09T12:00:00.000Z' },
    ])
    dublê.autorizar.mockResolvedValue(autorizado('app.exemplo.com'))
    montar(projeto('2026-10-09T12:00:00.000Z'))
    await pronta()

    const endereco = passo('autorizar-endereco')
    expect(await within(endereco).findByText('2 autorizados · 1 aguardando')).toBeTruthy()
    expect(
      within(endereco).getByRole('link', { name: 'Abrir Domínios' }).getAttribute('href'),
    ).toBe('/projects/p-1/domains#autorizados')
    // O endereco que esta esperando aparece pronto para autorizar.
    expect(
      within(endereco).getByRole('button', { name: 'Autorizar loja.exemplo.com' }),
    ).toBeTruthy()

    const lidas = dublê.autorizados.mock.calls.length
    fireEvent.change(within(endereco).getByRole('textbox', { name: 'Domínio do seu sistema' }), {
      target: { value: 'app.exemplo.com' },
    })
    fireEvent.click(within(endereco).getByRole('button', { name: 'Autorizar' }))

    await waitFor(() =>
      expect(dublê.autorizar).toHaveBeenCalledWith('p-1', {
        Domain: 'app.exemplo.com',
        AllowsSubdomains: false,
      }),
    )
    // Depois de autorizar, a tela le de novo: o passo se marca sozinho.
    await waitFor(() => expect(dublê.autorizados.mock.calls.length).toBeGreaterThan(lidas))
  })

  it('o teste abre pelo título, com a própria ferramenta', async () => {
    montar(projeto(null))
    await pronta()

    const titulo = document.getElementById('relato-de-teste') as HTMLElement
    fireEvent.click(within(titulo).getByRole('button', { name: 'Abrir teste' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByTitle('Ferramenta de relato').getAttribute('src')).toContain(
      'k=pk_live_loja123',
    )
    expect(passo('relato-de-teste').open).toBe(false)
  })

  it('o Avançado separa o seu próprio botão e a chave secreta', async () => {
    montar(projeto(null))
    await pronta()

    const avancado = document.getElementById('mais-opcoes') as HTMLDetailsElement
    expect(avancado.open).toBe(false)
    expect(avancado.querySelector('summary')?.textContent).toContain('Avançado')

    const proprio = document.getElementById('proprio-botao') as HTMLElement
    expect(within(proprio).getByRole('heading', { name: 'Seu próprio botão' })).toBeTruthy()
    expect(proprio.textContent).toContain('data-button="none"')
    expect(proprio.textContent).toContain('Pds.open()')
    expect(proprio.textContent).toContain('data-pds-open')

    const secreta = document.getElementById('chave-secreta') as HTMLElement
    expect(within(secreta).getByRole('heading', { name: 'Chave secreta' })).toBeTruthy()
    // As chaves sairam da lateral: a parte avancada da instalacao se abre daqui.
    expect(
      within(secreta)
        .getByRole('link', { name: 'Chaves e integração avançada' })
        .getAttribute('href'),
    ).toBe('/projects/p-1/keys')
  })

  it('as etiquetas da prévia levam aos campos de O botão', async () => {
    montar(projeto(null))
    await pronta()

    const etiquetas = screen.getByRole('list', { name: 'Ajustar em O botão' })
    const destino = (nome: string) =>
      within(etiquetas).getByRole('link', { name: nome }).getAttribute('href')
    expect(destino('Cor')).toBe('/projects/p-1/tool#cor-do-botao')
    expect(destino('Canto')).toBe('/projects/p-1/tool#canto')
    expect(destino('Ícone')).toBe('/projects/p-1/tool#icone')
    expect(destino('Páginas')).toBe('/projects/p-1/tool#paginas-escondidas')
    expect(screen.getByRole('link', { name: 'Ajustar o botão' }).getAttribute('href')).toBe(
      '/projects/p-1/tool',
    )
    expect(screen.queryByText(/Ferramenta\b|Configurações/)).toBeNull()
  })
})
