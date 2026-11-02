// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginScreen } from '@/features/auth/LoginScreen'

/**
 * O que a entrada diz em cada endereco. A maquete tem o teste dela, e aqui e trocada por
 * nada; o botao do Google tambem, porque o jsdom nao carrega a biblioteca dele.
 */
vi.mock('@/features/auth/ProductShowcase', () => ({ ProductShowcase: () => null }))
vi.mock('@/features/auth/googleIdentity', () => ({
  renderGoogleButton: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/shared/components/Reveal', () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// "Ver como funciona" volta ao topo da pagina, e o jsdom nao rola.
vi.stubGlobal('scrollTo', vi.fn())

// O cabecalho ganha borda quando a pagina rola, e quem conta e um
// IntersectionObserver, que o jsdom nao tem.
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const TITULO_DA_PAGINA = 'Relatos do seu sistema direto no quadro do time'

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
    expect(
      screen.getByRole('heading', { name: 'Você recebeu um convite para um time' }),
    ).toBeTruthy()
    expect(
      screen.getByText(/Entre com a conta Google do e-mail em que o convite chegou/),
    ).toBeTruthy()
    expect(screen.queryByRole('heading', { name: TITULO_DA_PAGINA })).toBeNull()
  })

  it('num link do painel, mostra so a entrada, e a pagina inteira fica a um botao', () => {
    montar('/projects/p-1/reports')
    expect(screen.getByRole('heading', { name: 'Entre para continuar' })).toBeTruthy()
    expect(screen.queryByText('Você recebeu um convite para um time')).toBeNull()
    expect(screen.queryByRole('heading', { name: TITULO_DA_PAGINA })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ver como funciona' }))
    expect(screen.getByRole('heading', { name: TITULO_DA_PAGINA })).toBeTruthy()
  })

  it('na raiz, e a pagina do produto, com as perguntas de quem esta decidindo', () => {
    montar('/')
    expect(screen.getByRole('heading', { level: 1, name: TITULO_DA_PAGINA })).toBeTruthy()
    expect(screen.getByText('Quem relata precisa criar conta?')).toBeTruthy()
    expect(screen.getByText('Os relatos ficam públicos?')).toBeTruthy()
    expect(screen.queryByText('Você recebeu um convite para um time')).toBeNull()
  })

  it('a pagina conta o caminho inteiro para comecar, com o endereco autorizado', () => {
    montar('/')
    expect(screen.getByText('Colar a linha no sistema')).toBeTruthy()
    expect(screen.getByText('Autorizar o endereço')).toBeTruthy()
  })
})
