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

/**
 * O passo pela ancora: ela mora no botao do titulo, que diz em `aria-expanded` se o passo
 * esta aberto; a secao em volta guarda o estado e o botao do passo, fora do titulo.
 */
const passo = (id: string) => {
  const botao = document.getElementById(id) as HTMLButtonElement
  return {
    open: botao.getAttribute('aria-expanded') === 'true',
    secao: botao.closest('section') as HTMLElement,
  }
}

const abertos = () =>
  ['script', 'autorizar-endereco', 'relato-de-teste'].filter((id) => passo(id).open)

/** O cabecalho do passo: o titulo, o estado escrito e o botao do passo. */
const cabecalho = (id: string) => passo(id).secao.firstElementChild as HTMLElement

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
    // A ancora do passo e o botao do titulo: o link da busca abre o passo dela.
    expect(document.getElementById('script')?.tagName).toBe('BUTTON')
  })

  it('sem nada feito, abre o primeiro passo e diz o que falta', async () => {
    montar(projeto(null))
    await pronta()

    expect(abertos()).toEqual(['script'])
    // Cada passo diz o que ainda nao aconteceu, e nao so "falta".
    expect(cabecalho('script').textContent).toContain('Ainda sem relato do seu sistema')
    expect(cabecalho('autorizar-endereco').textContent).toContain('Nenhum endereço autorizado')
    expect(cabecalho('relato-de-teste').textContent).toContain('Ainda não testado')
  })

  it('o passo aberto segue os dados: com o script colado, abre o do endereço', async () => {
    dublê.observados.mockResolvedValue([observado('loja.exemplo.com')])
    montar(projeto('2026-10-09T12:00:00.000Z'))
    await pronta()

    await waitFor(() => expect(abertos()).toEqual(['autorizar-endereco']))
    expect(cabecalho('script').textContent).toContain('Feito')
  })

  it('com o script e o endereço, o teste já conta; o relato do painel não conta como script', async () => {
    dublê.observados.mockResolvedValue([observado('loja.exemplo.com')])
    dublê.autorizados.mockResolvedValue([autorizado('loja.exemplo.com')])
    montar(projeto('2026-10-09T12:00:00.000Z'))
    await pronta()
    // O sistema ja manda relato: o teste nao tem o que provar, e nenhum passo fica aberto.
    await waitFor(() => expect(cabecalho('relato-de-teste').textContent).toContain('Feito'))
    expect(abertos()).toEqual([])

    cleanup()
    // So o relato de teste chegou: o script continua faltando.
    dublê.observados.mockResolvedValue([PAINEL()])
    montar(projeto('2026-10-09T12:00:00.000Z'))
    await pronta()
    await waitFor(() => expect(abertos()).toEqual(['script']))
    expect(cabecalho('relato-de-teste').textContent).toContain('Feito')
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
    expect(selo.textContent).toMatch(/^Funcionando, último relato há 5 minutos/)
    expect(abertos()).toEqual([])
    for (const id of ['script', 'autorizar-endereco', 'relato-de-teste'])
      expect(cabecalho(id).textContent).toContain('Feito')

    fireEvent.click(within(selo).getByRole('link', { name: 'Ver em Trabalho' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1/reports'))
  })

  it('copia o bloco pelo título, sem abrir o passo', async () => {
    dublê.observados.mockResolvedValue([observado('loja.exemplo.com')])
    montar(projeto('2026-10-09T12:00:00.000Z'))
    await pronta()
    await waitFor(() => expect(passo('script').open).toBe(false))

    const titulo = passo('script').secao
    fireEvent.click(within(titulo).getByRole('button', { name: 'Copiar script' }))

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

    const endereco = passo('autorizar-endereco').secao
    expect(await within(endereco).findByText('2 autorizados, 1 aguardando')).toBeTruthy()
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

    const titulo = passo('relato-de-teste').secao
    fireEvent.click(within(titulo).getByRole('button', { name: 'Abrir teste' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByTitle('Ferramenta de relato').getAttribute('src')).toContain(
      'k=pk_live_loja123',
    )
    expect(passo('relato-de-teste').open).toBe(false)
  })

  it('três passos e nada mais com cara de passo: o próprio botão mora no passo 1, e a chave secreta sai para Chaves', async () => {
    montar(projeto(null))
    await pronta()

    // So os tres passos tem caixa de passo: o "Avançado", que parecia um quarto, saiu.
    expect(screen.queryByText('Avançado')).toBeNull()
    expect(document.querySelectorAll('section[aria-labelledby$="-titulo"]')).toHaveLength(3)

    // O proprio botao e outro jeito de fazer o passo 1: mora nele, recolhido.
    const programa = document.getElementById('mais-opcoes') as HTMLDetailsElement
    expect(programa.open).toBe(false)
    expect(programa.querySelector('summary')?.textContent).toContain('Para quem programa')
    expect(passo('script').secao.contains(programa)).toBe(true)
    const proprio = document.getElementById('proprio-botao') as HTMLElement
    expect(programa.contains(proprio)).toBe(true)
    expect(within(proprio).getByRole('heading', { name: 'Seu próprio botão' })).toBeTruthy()
    expect(proprio.textContent).toContain('data-button="none"')
    expect(proprio.textContent).toContain('RelatoFacil.open()')
    expect(proprio.textContent).toContain('data-relatofacil-open')

    // A chave secreta e outra tarefa: a linha diz que ela fica em Chaves, e o link diz para onde leva.
    const secreta = document.getElementById('chave-secreta') as HTMLElement
    expect(passo('script').secao.contains(secreta)).toBe(false)
    expect(secreta.textContent).toContain('a chave secreta fica em Chaves')
    expect(within(secreta).getByRole('link', { name: 'Abrir Chaves' }).getAttribute('href')).toBe(
      '/projects/p-1/keys',
    )
  })

  it('o recado para quem cuida do sistema leva o script e onde colar, e conta como o script entregue', async () => {
    montar(projeto(null))
    await pronta()

    fireEvent.click(
      within(passo('script').secao).getByRole('button', {
        name: 'Copiar instruções para quem cuida dele',
      }),
    )

    await waitFor(() => expect(dublê.copiar).toHaveBeenCalledTimes(1))
    const recado = dublê.copiar.mock.calls[0]?.[0] ?? ''
    expect(recado).toContain('pk_live_loja123')
    expect(recado).toContain('antes do fechamento do </body>')
    expect(recado).toContain('Me diga o endereço do sistema')
    await waitFor(() =>
      expect(cabecalho('script').textContent).toContain('Esperando o primeiro relato'),
    )
  })

  it('a prévia tem um link só, que diz que leva para O botão', async () => {
    montar(projeto(null))
    await pronta()

    // As sete etiquetas (Cor, Canto, Icone...) pareciam marcadores e trocavam de tela sem avisar.
    expect(screen.queryByRole('list', { name: 'Ajustar em O botão' })).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Mudar a aparência em O botão' }).getAttribute('href'),
    ).toBe('/projects/p-1/tool')
    expect(screen.queryByText(/Ferramenta\b|Configurações/)).toBeNull()
  })
})
