// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { LeaveGuard } from '@/shared/components/LeaveGuard'

/**
 * A pergunta ao sair, com o cabecalho, esta em `SettingsHeader.test.tsx`. Aqui, o guarda
 * sozinho — o das telas que salvam num item, sem o cabecalho.
 */
describe('LeaveGuard', () => {
  afterEach(cleanup)

  // Sem ter o que salvar por ele, o guarda sozinho pergunta igual, e so oferece voltar.
  it('sozinho, pergunta igual e só oferece voltar', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/tela',
          element: (
            <>
              <LeaveGuard when />
              <Link to="/outra">ir para outra tela</Link>
            </>
          ),
        },
        { path: '/outra', element: <p>outra tela</p> },
      ],
      { initialEntries: ['/tela'] },
    )
    render(<RouterProvider router={router} />)

    fireEvent.click(screen.getByRole('link', { name: 'ir para outra tela' }))

    const pergunta = await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' })
    expect(within(pergunta).getByRole('button', { name: 'Voltar' })).toBeTruthy()
    expect(within(pergunta).queryByRole('button', { name: 'Voltar e salvar' })).toBeNull()
    expect(router.state.location.pathname).toBe('/tela')
  })
})
