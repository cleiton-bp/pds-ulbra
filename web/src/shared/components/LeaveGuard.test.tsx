// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  // O editor de um item (Etiquetas, Prioridades, Tipos, Colunas): "Voltar e salvar" leva ao
  // Salvar dele, com o foco e o botao chamando atencao, e nao salva por conta propria.
  it('"Voltar e salvar" leva ao botão de salvar da tela, sem salvar', async () => {
    const salvar = vi.fn()
    const router = createMemoryRouter(
      [
        {
          path: '/tela',
          element: (
            <>
              <LeaveGuard when canSave />
              <button type="button" onClick={salvar} data-salvar-da-tela>
                Salvar
              </button>
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
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Voltar e salvar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    const botao = screen.getByRole('button', { name: 'Salvar' })
    await waitFor(() => expect(document.activeElement).toBe(botao))
    expect(botao.hasAttribute('data-chamando')).toBe(true)
    expect(salvar).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/tela')
  })

  // Fechar pelo Esc e so voltar: o foco nao e levado a lugar nenhum.
  it('o Esc só volta, sem chamar o botão de salvar', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/tela',
          element: (
            <>
              <LeaveGuard when canSave />
              <button type="button" data-salvar-da-tela>
                Salvar
              </button>
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
    fireEvent.keyDown(pergunta, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Salvar' }).hasAttribute('data-chamando')).toBe(false)
    expect(router.state.location.pathname).toBe('/tela')
  })
})
