// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileScreen } from '@/features/profile/ProfileScreen'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

instalarRemendosDoRadix()

/**
 * O QUE ESTES TESTES TRAVAM: o Perfil.
 *
 * - **Quem e a pessoa**, so para ler: o nome, o e-mail e a conta da sessao.
 * - **Um som para cada tipo de aviso**, com "Ouvir" no volume da tela, antes de salvar.
 * - **Salvar manda tudo**: o volume e os sons; sem mudanca, nao ha o que salvar.
 */
const dublê = vi.hoisted(() => ({ ler: vi.fn(), salvar: vi.fn(), tocar: vi.fn() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    notificationService: { getSettings: dublê.ler, saveSettings: dublê.salvar },
  }
})

vi.mock('@/shared/lib/notificationSounds', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/shared/lib/notificationSounds')>()
  return { ...real, playNotificationSound: dublê.tocar }
})

// A sessao, simulada: o Perfil le so quem esta logado.
vi.mock('@/features/auth/sessionStore', () => ({
  useSessionStore: (escolher: (estado: unknown) => unknown) =>
    escolher({
      user: {
        PublicId: 'u-1',
        Name: 'Ana Dona',
        Email: 'ana@exemplo.test',
        AvatarUrl: null,
        LastLoginAt: null,
        Account: { PublicId: 'a-1', Name: 'Conta da Ana', CreatedAt: '2026-10-01T00:00:00.000Z' },
      },
    }),
}))

const AJUSTES = {
  Volume: 70,
  Sounds: [
    { Kind: 'Mention' as const, Sound: 'Ping' as const },
    { Kind: 'Assignment' as const, Sound: 'Bell' as const },
  ],
}

describe('o Perfil', () => {
  afterEach(cleanup)
  beforeEach(() => {
    for (const d of Object.values(dublê)) d.mockReset()
    dublê.ler.mockResolvedValue(AJUSTES)
  })

  it('mostra quem e a pessoa e o som de cada tipo de aviso', async () => {
    render(<ProfileScreen />)
    expect(screen.getByText('Ana Dona')).toBeTruthy()
    expect(screen.getByText('ana@exemplo.test')).toBeTruthy()
    expect(screen.getByText('Conta da Ana')).toBeTruthy()
    expect(
      (await screen.findByRole('combobox', { name: 'Quando alguém me menciona' })).textContent,
    ).toContain('Plim')
    expect(
      screen.getByRole('combobox', { name: 'Quando me escolhem como responsável' }).textContent,
    ).toContain('Sino')
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveProperty('disabled', true)
  })

  it('trocar o som e o volume, ouvir antes, e salvar tudo', async () => {
    dublê.salvar.mockImplementation(async (pedido) => pedido)
    render(<ProfileScreen />)
    fireEvent.pointerDown(
      await screen.findByRole('combobox', { name: 'Quando alguém me menciona' }),
      { button: 0, ctrlKey: false, pointerType: 'mouse' },
    )
    fireEvent.click(await screen.findByRole('option', { name: 'Gota' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '35' } })
    expect(screen.getByText('35%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvir o som: quando alguém me menciona' }))
    expect(dublê.tocar).toHaveBeenCalledWith('Drop', 35)

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(dublê.salvar).toHaveBeenCalledWith({
        Volume: 35,
        Sounds: [
          { Kind: 'Mention', Sound: 'Drop' },
          { Kind: 'Assignment', Sound: 'Bell' },
        ],
      }),
    )
  })

  it('depois de salvar, a base e o que se salvou: voltar ao de antes e uma mudanca', async () => {
    dublê.salvar.mockImplementation(async (pedido) => pedido)
    render(<ProfileScreen />)
    const volume = await screen.findByRole('slider', { name: 'Volume' })
    fireEvent.change(volume, { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar' })).toHaveProperty('disabled', true),
    )
    fireEvent.change(volume, { target: { value: '70' } })
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveProperty('disabled', false)
  })

  it('volume zero e "Mudo", e nao deixa ouvir', async () => {
    render(<ProfileScreen />)
    fireEvent.change(await screen.findByRole('slider', { name: 'Volume' }), {
      target: { value: '0' },
    })
    expect(screen.getByText('Mudo')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Ouvir o som: quando alguém me menciona' }),
    ).toHaveProperty('disabled', true)
  })
})
