// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **O titulo da aba diz a tela**, e nunca o nome do produto: com o hub e um convite
 * abertos em abas, todas se chamavam igual. (O Perfil nao e mais tela: e um dialogo
 * sobre a tela aberta, com os testes dele.) **E a marca leva aos projetos** — no
 * convite ela era um texto parado, e a unica volta era o botao do navegador, que no
 * celular nem sempre esta a vista.
 */
vi.hoisted(() => {
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
})

const { AccountShell } = await import('@/app/AccountShell')

function abrir(endereco: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AccountShell />,
        children: [
          { path: '/projects', element: <p>hub</p> },
          { path: '/invite', element: <p>convite</p> },
        ],
      },
    ],
    { initialEntries: [endereco] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('AccountShell', () => {
  afterEach(cleanup)

  it('o título da aba diz a tela', async () => {
    const router = abrir('/projects')
    await waitFor(() => expect(document.title).toBe('Projetos'))

    await act(() => router.navigate('/invite'))
    await waitFor(() => expect(document.title).toBe('Convite'))
  })

  it('a marca leva aos projetos, também no convite', async () => {
    abrir('/invite')
    expect(await screen.findByText('convite')).toBeTruthy()
    expect(screen.getByTitle('Ir para os projetos').getAttribute('href')).toBe('/projects')
  })
})
