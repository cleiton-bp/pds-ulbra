// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginScreen } from '@/features/auth/LoginScreen'

/**
 * So o que a entrada diz a quem chega pelo link de um convite. As vitrines da
 * pagina sao trocadas por nada: animacao e observador de rolagem nao sao o
 * assunto, e o jsdom nao tem o que elas usam.
 */
vi.mock('@/features/auth/ProductShowcase', () => ({ ProductShowcase: () => null }))
vi.mock('@/features/auth/AccessSteps', () => ({ AccessSteps: () => null }))
vi.mock('@/shared/components/Reveal', () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// O cabecalho ganha borda quando a pagina rola, e quem conta e um
// IntersectionObserver — que o jsdom nao tem.
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

function montar(endereco: string) {
  render(
    <MemoryRouter initialEntries={[endereco]}>
      <LoginScreen />
    </MemoryRouter>,
  )
}

describe('LoginScreen', () => {
  afterEach(cleanup)

  it('quem chega pelo link do convite sabe por que esta ali, e com qual conta entrar', () => {
    montar('/invite#t=abc')
    expect(screen.getByText('Você recebeu um convite para um time')).toBeTruthy()
    expect(
      screen.getByText(/Entre com a conta Google do e-mail em que o convite chegou/),
    ).toBeTruthy()
  })

  it('na entrada de sempre, o aviso do convite nao aparece', () => {
    montar('/projects')
    expect(screen.queryByText('Você recebeu um convite para um time')).toBeNull()
  })
})
