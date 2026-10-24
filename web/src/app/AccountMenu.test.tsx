// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

instalarRemendosDoRadix()

/**
 * O QUE ESTES TESTES TRAVAM: o Perfil abre como dialogo, e nao como pagina.
 *
 * - **Pelo menu da conta**, "Perfil" abre o dialogo sobre a tela aberta, **sem trocar o
 *   endereco** — quem estava num card continua nele.
 * - **Pelo sino**, "Preferências de aviso" abre o mesmo dialogo ja nos sons, com o foco
 *   no titulo "Avisos".
 * - **Fechar devolve o foco ao botao que abriu** (a conta, o sino): o item do menu some
 *   com o menu, e sem isso o foco caia no comeco da pagina.
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

const dublê = vi.hoisted(() => ({
  contar: vi.fn(),
  listar: vi.fn(),
  preferencias: vi.fn(),
  salvar: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    notificationService: {
      countUnread: dublê.contar,
      listNotifications: dublê.listar,
      getSettings: dublê.preferencias,
      saveSettings: dublê.salvar,
    },
  }
})

const { AccountMenu } = await import('@/app/AccountMenu')
const { NotificationBell } = await import('@/features/notifications/NotificationBell')
const { ProfileDialog } = await import('@/features/profile/ProfileDialog')
const { useSessionStore } = await import('@/features/auth/sessionStore')
const { useProfileDialogStore } = await import('@/shared/lib/profileDialogStore')

function Onde() {
  return <span data-testid="onde">{useLocation().pathname}</span>
}

/** A barra de cima como as cascas a montam, num card aberto. */
function montar() {
  render(
    <MemoryRouter initialEntries={['/projects/p-1/reports/c-42']}>
      <NotificationBell />
      <AccountMenu />
      <ProfileDialog />
      <Routes>
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  )
}

const abrirMenu = (botao: HTMLElement) =>
  fireEvent.pointerDown(botao, { button: 0, ctrlKey: false, pointerType: 'mouse' })

describe('o Perfil pelo menu da conta e pelo sino', () => {
  afterEach(() => {
    cleanup()
    useProfileDialogStore.setState({ open: false, section: null, returnFocusTo: null })
  })
  beforeEach(() => {
    for (const d of Object.values(dublê)) d.mockReset()
    dublê.contar.mockResolvedValue({ UnreadCount: 0 })
    dublê.listar.mockResolvedValue({ Items: [], UnreadCount: 0 })
    dublê.preferencias.mockResolvedValue({
      Volume: 70,
      Sounds: [
        { Kind: 'Mention', Sound: 'Ping' },
        { Kind: 'Assignment', Sound: 'Bell' },
      ],
    })
    useSessionStore.setState({
      status: 'authenticated',
      user: {
        PublicId: 'u-1',
        Name: 'Ana Dona',
        Email: 'ana@exemplo.test',
        AvatarUrl: null,
        LastLoginAt: null,
        Account: { PublicId: 'a-1', Name: 'Conta da Ana', CreatedAt: '2026-10-01T00:00:00.000Z' },
      },
    })
  })

  it('"Perfil" abre o dialogo sobre a tela, sem trocar o endereco; o Esc devolve o foco a conta', async () => {
    montar()
    const conta = screen.getByRole('button', { name: 'Conta' })
    abrirMenu(conta)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Perfil' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Perfil' })
    expect(screen.getByTestId('onde').textContent).toBe('/projects/p-1/reports/c-42')
    // O conteudo de sempre: quem e a pessoa e os sons.
    expect(screen.getAllByText('Conta da Ana').length).toBeGreaterThan(0)
    expect(await screen.findByRole('combobox', { name: 'Quando alguém me menciona' })).toBeTruthy()
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' })),
    )

    fireEvent.keyDown(dialogo, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(conta))
    expect(screen.getByTestId('onde').textContent).toBe('/projects/p-1/reports/c-42')
  })

  it('"Preferências de aviso" abre nos sons, com o foco em "Avisos"; o X devolve o foco ao sino', async () => {
    montar()
    const sino = await screen.findByRole('button', { name: /^Avisos/ })
    abrirMenu(sino)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Preferências de aviso' }))

    await screen.findByRole('dialog', { name: 'Perfil' })
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Avisos' })),
    )
    expect(screen.getByTestId('onde').textContent).toBe('/projects/p-1/reports/c-42')

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(sino))
  })
})
