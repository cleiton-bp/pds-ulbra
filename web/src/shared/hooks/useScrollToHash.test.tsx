// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollToHash } from '@/shared/hooks/useScrollToHash'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * A busca da configuracao leva a `tela#campo`. Chegar la e **ver o campo**: a tela rola
 * ate ele, abre o "Mais opções" fechado em volta dele, poe o foco no campo (e nao no
 * titulo da secao) e o acende — so quando quem levou pediu o realce, que o sino nao pede.
 * O `#` de uma secao continua focando o titulo dela.
 */
function Casca() {
  useScrollToHash()
  return <Outlet />
}

function Tela() {
  return (
    <div>
      <section id="secao">
        <h2>Uma seção</h2>
        <input aria-label="primeiro da seção" />
      </section>
      <details>
        <summary>Mais opções</summary>
        <input id="campo" aria-label="campo escondido" />
      </details>
    </div>
  )
}

function abrir(endereco: string, state?: unknown) {
  const router = createMemoryRouter(
    [{ path: '/', element: <Casca />, children: [{ path: 'tela', element: <Tela /> }] }],
    {
      initialEntries: [
        {
          pathname: endereco.split('#')[0],
          hash: endereco.split('#')[1] ? `#${endereco.split('#')[1]}` : '',
          state,
        },
      ],
    },
  )
  render(<RouterProvider router={router} />)
  return router
}

const rolar = vi.fn()
const acender = vi.fn()

beforeEach(() => {
  Element.prototype.scrollIntoView = rolar
  ;(Element.prototype as unknown as { animate: typeof acender }).animate = acender
})

afterEach(() => {
  cleanup()
  rolar.mockReset()
  acender.mockReset()
})

describe('useScrollToHash', () => {
  it('o campo dentro do "Mais opções" fechado: abre, rola, foca e acende', async () => {
    abrir('/tela#campo', { realce: true })

    const campo = document.getElementById('campo') as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(campo))
    expect(campo.closest('details')?.open).toBe(true)
    expect(rolar).toHaveBeenCalled()
    expect(acender).toHaveBeenCalled()
  })

  it('sem o pedido de realce, chega ao campo sem acender', async () => {
    abrir('/tela#campo')

    await waitFor(() => expect(document.activeElement?.id).toBe('campo'))
    expect(acender).not.toHaveBeenCalled()
  })

  it('o # de uma seção foca o título dela, e não o primeiro campo', async () => {
    const router = abrir('/tela')
    await act(() => router.navigate('/tela#secao'))

    await waitFor(() => expect(document.activeElement?.textContent).toBe('Uma seção'))
  })
})
