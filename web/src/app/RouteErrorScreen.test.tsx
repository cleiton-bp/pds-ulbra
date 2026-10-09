// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorScreen } from '@/app/RouteErrorScreen'

vi.hoisted(() => {
  // As rotas de verdade carregam o tema, que le a preferencia do sistema; o jsdom nao
  // tem matchMedia.
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
})

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Uma tela que quebra mostra uma saida, e nao o rastro da pilha.** Sem a tela de
 * erro, o roteador desenhava a dele: a pilha em ingles, "Hey developer", e nenhum
 * botao — quem estava no meio de um arrasto perdia a tela sem saber o que fazer. A
 * frase diz que o que estava salvo continua salvo, e os dois botoes **recarregam de
 * verdade**, sem navegar por dentro: o estado que levou ao erro vai embora com a
 * pagina. O detalhe tecnico vai para o console, que e de quem investiga.
 *
 * **Toda rota tem a tela**: a raiz (o painel inteiro) e o 404, que vem sob demanda
 * — depois de uma publicacao nova, o pedaco antigo pode nao existir mais.
 */
const DETALHE = "Cannot read properties of undefined (reading 'map')"

function Quebra(): never {
  throw new Error(DETALHE)
}

function abrir(rotas: Parameters<typeof createMemoryRouter>[0], endereco: string) {
  const router = createMemoryRouter(rotas, { initialEntries: [endereco] })
  render(<RouterProvider router={router} />)
  return router
}

describe('RouteErrorScreen', () => {
  let erroNoConsole: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // O React e o roteador tambem escrevem no console quando uma tela quebra; o que
    // importa aqui e que o erro chegue la, e nao a tela.
    erroNoConsole = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    erroNoConsole.mockRestore()
  })

  it('a tela que quebra vira uma saída, sem o detalhe técnico', async () => {
    const router = abrir(
      [
        {
          path: '/',
          errorElement: <RouteErrorScreen />,
          children: [
            { path: 'projects/:publicId/reports', element: <Quebra /> },
            { path: 'projects', element: <p>hub</p> },
          ],
        },
      ],
      '/projects/p-1/reports',
    )

    expect(await screen.findByRole('heading', { name: 'Algo deu errado nesta tela' })).toBeTruthy()
    expect(
      screen.getByText(
        'O que já estava salvo continua salvo. Recarregar a página costuma resolver.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recarregar a página' })).toBeTruthy()
    const voltar = screen.getByRole('button', { name: 'Voltar aos projetos' })

    // O detalhe vai para o console, e nao para a tela.
    expect(document.body.textContent).not.toContain(DETALHE)
    expect(document.body.textContent).not.toMatch(/Hey developer|Unexpected Application Error/)
    expect(erroNoConsole).toHaveBeenCalledWith(expect.objectContaining({ message: DETALHE }))

    // Os dois sao botoes que recarregam a pagina, e nao links do roteador: um link
    // navegaria por dentro, com o estado que quebrou ainda em memoria. (O jsdom nao
    // troca de documento, entao o clique em si nao e conferido aqui.)
    expect(voltar.tagName).toBe('BUTTON')
    expect(screen.queryByRole('link', { name: 'Voltar aos projetos' })).toBeNull()
    expect(router.state.location.pathname).toBe('/projects/p-1/reports')
  })

  it('a rota que vem sob demanda e falha ao chegar também cai nela', async () => {
    abrir(
      [
        {
          path: '*',
          lazy: async () => {
            throw new TypeError('Failed to fetch dynamically imported module')
          },
          errorElement: <RouteErrorScreen />,
        },
      ],
      '/endereco-que-nao-existe',
    )

    expect(await screen.findByRole('heading', { name: 'Algo deu errado nesta tela' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('dynamically imported module')
  })

  it('as rotas do painel têm a tela: a raiz e o 404', async () => {
    const { router } = await import('@/app/routes')
    try {
      const [raiz, naoEncontrada] = router.routes
      expect(raiz?.path).toBe('/')
      expect(naoEncontrada?.path).toBe('*')
      for (const rota of [raiz, naoEncontrada]) {
        const tela = rota?.errorElement as { type?: unknown } | undefined
        expect(tela?.type).toBe(RouteErrorScreen)
      }
    } finally {
      router.dispose()
    }
  })
})
