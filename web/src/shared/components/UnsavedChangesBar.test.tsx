// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeaveGuard, UnsavedChangesBar } from '@/shared/components/UnsavedChangesBar'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A barra so existe com o que salvar.** O Salvar no fim de uma pagina longa ficava
 * fora da janela: quem mudava uma coisa no meio e clicava em outra secao achava que
 * tinha salvo. Presa no pe, a barra fica a vista enquanto ha mudanca — e some sem
 * ela, porque um Salvar sempre a vista convida a clicar sem nada para salvar.
 *
 * **Sair com mudanca pergunta antes**, e o destaque e voltar: "Voltar e salvar" fica
 * na tela e salva, que e o que a pessoa ia fazer se tivesse visto o botao. So a troca
 * de endereco conta — a mesma tela com outra busca e a propria tela se atualizando.
 * Fechar a aba ou recarregar fica com o aviso do navegador.
 */
interface Props {
  salvar?: () => void
  descartar?: () => void
  canSave?: boolean
  saving?: boolean
  comMudanca?: boolean
}

function Tela({
  salvar = () => {},
  descartar = () => {},
  canSave = true,
  saving = false,
  comMudanca = false,
}: Props) {
  const [dirty, setDirty] = useState(comMudanca)

  return (
    <div>
      <button type="button" onClick={() => setDirty(true)}>
        mudar
      </button>
      <Link to="/outra">ir para outra tela</Link>
      <Link to="/tela?aba=2">mesma tela, outra aba</Link>
      <UnsavedChangesBar
        dirty={dirty}
        saving={saving}
        canSave={canSave}
        onSave={salvar}
        onDiscard={() => {
          descartar()
          setDirty(false)
        }}
      />
    </div>
  )
}

function montar(props: Props = {}) {
  const router = createMemoryRouter(
    [
      { path: '/tela', element: <Tela {...props} /> },
      { path: '/outra', element: <p>outra tela</p> },
    ],
    { initialEntries: ['/tela'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const barra = () => screen.queryByRole('region', { name: 'Alterações não salvas' })

describe('UnsavedChangesBar', () => {
  afterEach(cleanup)

  it('sem mudança, nem barra nem pergunta: sair é direto', async () => {
    const router = montar()

    expect(barra()).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'ir para outra tela' }))

    expect(await screen.findByText('outra tela')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/outra')
  })

  it('com mudança, a barra aparece com Salvar, Descartar e o aviso', () => {
    const salvar = vi.fn()
    const descartar = vi.fn()
    montar({ salvar, descartar })

    fireEvent.click(screen.getByRole('button', { name: 'mudar' }))

    const presa = barra() as HTMLElement
    expect(within(presa).getByText('Alterações não salvas.')).toBeTruthy()
    fireEvent.click(within(presa).getByRole('button', { name: 'Salvar' }))
    expect(salvar).toHaveBeenCalledTimes(1)

    fireEvent.click(within(presa).getByRole('button', { name: 'Descartar' }))
    expect(descartar).toHaveBeenCalledTimes(1)
    expect(barra()).toBeNull()
  })

  it('sair com mudança pergunta antes, e "Voltar e salvar" fica na tela e salva', async () => {
    const salvar = vi.fn()
    const router = montar({ salvar })

    fireEvent.click(screen.getByRole('button', { name: 'mudar' }))
    fireEvent.click(screen.getByRole('link', { name: 'ir para outra tela' }))

    const pergunta = await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' })
    expect(within(pergunta).getByText('As mudanças desta tela vão se perder.')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/tela')
    expect(salvar).not.toHaveBeenCalled()

    fireEvent.click(within(pergunta).getByRole('button', { name: 'Voltar e salvar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(salvar).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/tela')
  })

  it('"Sair sem salvar" sai, sem salvar', async () => {
    const salvar = vi.fn()
    const router = montar({ salvar })

    fireEvent.click(screen.getByRole('button', { name: 'mudar' }))
    fireEvent.click(screen.getByRole('link', { name: 'ir para outra tela' }))
    const pergunta = await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' })

    fireEvent.click(within(pergunta).getByRole('button', { name: 'Sair sem salvar' }))

    expect(await screen.findByText('outra tela')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/outra')
    expect(salvar).not.toHaveBeenCalled()
  })

  it('a mesma tela com outra busca no endereço não pergunta', async () => {
    const router = montar()

    fireEvent.click(screen.getByRole('button', { name: 'mudar' }))
    fireEvent.click(screen.getByRole('link', { name: 'mesma tela, outra aba' }))

    await waitFor(() => expect(router.state.location.search).toBe('?aba=2'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    // A mudanca continua: a barra nao foi embora com a busca.
    expect(barra()).toBeTruthy()
  })

  it('com campo a corrigir, o Salvar fica desligado e a pergunta só oferece voltar', async () => {
    const salvar = vi.fn()
    const router = montar({ salvar, canSave: false })

    fireEvent.click(screen.getByRole('button', { name: 'mudar' }))
    expect(
      (within(barra() as HTMLElement).getByRole('button', { name: 'Salvar' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole('link', { name: 'ir para outra tela' }))
    const pergunta = await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' })
    expect(within(pergunta).queryByRole('button', { name: 'Voltar e salvar' })).toBeNull()

    fireEvent.click(within(pergunta).getByRole('button', { name: 'Voltar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(salvar).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/tela')
  })

  it('salvando, a barra diz "Salvando…" com os botões desligados, e sair não pergunta', async () => {
    const router = montar({ saving: true, comMudanca: true })

    const presa = barra() as HTMLElement
    expect(
      (within(presa).getByRole('button', { name: 'Salvando…' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (within(presa).getByRole('button', { name: 'Descartar' }) as HTMLButtonElement).disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole('link', { name: 'ir para outra tela' }))

    expect(await screen.findByText('outra tela')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/outra')
  })

  it('fechar ou recarregar a aba com mudança pede o aviso do navegador', () => {
    montar()

    const semMudanca = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(semMudanca)
    expect(semMudanca.defaultPrevented).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'mudar' }))

    const comMudanca = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(comMudanca)
    expect(comMudanca.defaultPrevented).toBe(true)
  })
})

describe('LeaveGuard', () => {
  afterEach(cleanup)

  // O nome do projeto salva ao lado do campo, sem barra: o guarda sozinho pergunta
  // igual, e sem ter o que salvar por ele, so oferece voltar.
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
