// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileRoute } from '@/app/ProfileRoute'
import { ProfileDialog } from '@/features/profile/ProfileDialog'
import { useProfileDialogStore } from '@/shared/lib/profileDialogStore'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

instalarRemendosDoRadix()

/**
 * O QUE ESTES TESTES TRAVAM: o endereco antigo `/profile` continua valendo.
 *
 * - **Chegando direto** (link salvo, favorito), abre o dialogo do perfil sobre o hub dos
 *   projetos — e nao uma pagina; fechar deixa a pessoa no hub.
 * - **O `#` segue valendo**: `/profile#sons` abre nos sons, com o foco no titulo.
 * - **Vindo de uma tela do painel**, volta a ela, com o dialogo aberto por cima.
 */
const dublê = vi.hoisted(() => ({ ler: vi.fn(), salvar: vi.fn() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    notificationService: { getSettings: dublê.ler, saveSettings: dublê.salvar },
  }
})

/** A casca resumida: as telas e o dialogo montado ao lado, como nas de verdade. */
function abrir(entradas: string[]) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            <ProfileDialog />
          </>
        ),
        children: [
          { path: '/projects', element: <p>Tela dos projetos</p> },
          { path: '/projects/p-1/reports', element: <p>Tela de Trabalho</p> },
          { path: '/profile', element: <ProfileRoute /> },
        ],
      },
    ],
    { initialEntries: entradas, initialIndex: entradas.length - 1 },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('o endereço /profile', () => {
  afterEach(() => {
    cleanup()
    useProfileDialogStore.setState({ open: false, section: null, returnFocusTo: null })
  })
  beforeEach(() => {
    dublê.ler.mockReset()
    dublê.ler.mockResolvedValue({ Volume: 70, Sounds: [{ Kind: 'Mention', Sound: 'Ping' }] })
  })

  it('aberto direto, mostra o hub com o Perfil por cima; fechar fica no hub', async () => {
    const router = abrir(['/profile'])
    expect(await screen.findByRole('dialog', { name: 'Perfil' })).toBeTruthy()
    expect(await screen.findByText('Tela dos projetos')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/projects')

    act(() => screen.getByRole('button', { name: 'Fechar' }).click())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/projects')
  })

  it('/profile#sons abre nos sons, com o foco no titulo "Avisos"', async () => {
    abrir(['/profile#sons'])
    await screen.findByRole('dialog', { name: 'Perfil' })
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Avisos' })),
    )
  })

  it('vindo de uma tela do painel, volta a ela com o Perfil por cima', async () => {
    const router = abrir(['/projects/p-1/reports', '/profile'])
    expect(await screen.findByRole('dialog', { name: 'Perfil' })).toBeTruthy()
    expect(await screen.findByText('Tela de Trabalho')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/projects/p-1/reports')
  })
})
