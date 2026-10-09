// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileScreen } from '@/features/profile/ProfileScreen'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

instalarRemendosDoRadix()

/**
 * O QUE ESTES TESTES TRAVAM: o Perfil.
 *
 * - **Quem e a pessoa**, so para ler: o nome, o e-mail e a conta da sessao.
 * - **Escolher toca e grava** (S-12): escolher o som de um tipo toca o som no volume da
 *   tela e manda tudo (o volume e os sons) na hora — sem botao "Salvar", e sair sem
 *   salvar nao perde nada. "Ouvir" continua.
 * - **O volume grava uma vez por ajuste**: 400 ms depois do ultimo movimento, com o
 *   valor final; soltar o controle (ponteiro ou setas) toca o som da mencao no volume
 *   novo; sair da tela com o volume esperando grava assim mesmo.
 * - **"Salvando…", "Salvo." e a falha** com "Tentar de novo", numa regiao anunciada.
 * - **Nao e um beco** (S-11, N-09): "← Voltar" volta a tela de onde a pessoa veio;
 *   chegando direto, "← Projetos".
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

/** O Perfil como a rota o mostra: depois da tela de Trabalho, ou aberto direto. */
function abrir(veioDe: string | null = null) {
  render(
    <MemoryRouter
      initialEntries={veioDe ? [veioDe, '/profile'] : ['/profile']}
      initialIndex={veioDe ? 1 : 0}
    >
      <Routes>
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/projects" element={<p>Tela dos projetos</p>} />
        <Route path="/projects/p-1/work" element={<p>Tela de Trabalho</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const esperar = (ms: number) => act(() => new Promise((pronto) => setTimeout(pronto, ms)))

async function escolherSom(tipo: string, som: string) {
  fireEvent.pointerDown(await screen.findByRole('combobox', { name: tipo }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  fireEvent.click(await screen.findByRole('option', { name: som }))
}

describe('o Perfil', () => {
  afterEach(cleanup)
  beforeEach(() => {
    for (const d of Object.values(dublê)) d.mockReset()
    dublê.ler.mockResolvedValue(AJUSTES)
    dublê.salvar.mockImplementation(async (pedido) => pedido)
  })

  it('mostra quem e a pessoa e o som de cada tipo de aviso — sem botao de salvar', async () => {
    abrir()
    expect(screen.getByText('Ana Dona')).toBeTruthy()
    expect(screen.getByText('ana@exemplo.test')).toBeTruthy()
    expect(screen.getByText('Conta da Ana')).toBeTruthy()
    expect(
      (await screen.findByRole('combobox', { name: 'Quando alguém me menciona' })).textContent,
    ).toContain('Plim')
    expect(
      screen.getByRole('combobox', { name: 'Quando me escolhem como responsável' }).textContent,
    ).toContain('Sino')
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
    expect(screen.getByText(/ao escolher, você ouve, e fica salvo/)).toBeTruthy()
    // Abrir nao grava nada.
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('escolher o som toca no volume da tela e grava tudo na hora', async () => {
    abrir()
    await escolherSom('Quando alguém me menciona', 'Gota')

    expect(dublê.tocar).toHaveBeenCalledWith('Drop', 70)
    await waitFor(() =>
      expect(dublê.salvar).toHaveBeenCalledWith({
        Volume: 70,
        Sounds: [
          { Kind: 'Mention', Sound: 'Drop' },
          { Kind: 'Assignment', Sound: 'Bell' },
        ],
      }),
    )
    expect(dublê.salvar).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Salvo.')).toBeTruthy()
    expect(screen.getByText('Salvo.').closest('[role="status"]')).toBeTruthy()

    // "Ouvir" continua, no volume da tela.
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir o som: quando alguém me menciona' }))
    expect(dublê.tocar).toHaveBeenLastCalledWith('Drop', 70)
  })

  it('o volume grava uma vez por ajuste, com o valor final, e soltar toca o som da mencao', async () => {
    abrir()
    const volume = await screen.findByRole('slider', { name: 'Volume' })
    fireEvent.change(volume, { target: { value: '40' } })
    fireEvent.change(volume, { target: { value: '45' } })
    fireEvent.change(volume, { target: { value: '35' } })
    expect(screen.getByText('35%')).toBeTruthy()
    // Ainda mexendo: nada gravado.
    await esperar(200)
    expect(dublê.salvar).not.toHaveBeenCalled()

    fireEvent.pointerUp(volume)
    expect(dublê.tocar).toHaveBeenCalledWith('Ping', 35)

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    expect(dublê.salvar).toHaveBeenCalledWith({
      Volume: 35,
      Sounds: [
        { Kind: 'Mention', Sound: 'Ping' },
        { Kind: 'Assignment', Sound: 'Bell' },
      ],
    })

    // Pelas setas, soltar a tecla tambem toca.
    dublê.tocar.mockClear()
    fireEvent.keyUp(volume, { key: 'ArrowRight' })
    expect(dublê.tocar).toHaveBeenCalledWith('Ping', 35)
    fireEvent.keyUp(volume, { key: 'Tab' })
    expect(dublê.tocar).toHaveBeenCalledTimes(1)
  })

  it('sem som na mencao, soltar o volume toca o primeiro que tem som', async () => {
    dublê.ler.mockResolvedValue({
      Volume: 50,
      Sounds: [
        { Kind: 'Mention', Sound: 'None' },
        { Kind: 'Assignment', Sound: 'Bell' },
      ],
    })
    abrir()
    fireEvent.pointerUp(await screen.findByRole('slider', { name: 'Volume' }))
    expect(dublê.tocar).toHaveBeenCalledWith('Bell', 50)
  })

  it('sair da tela com o volume esperando grava assim mesmo', async () => {
    abrir()
    fireEvent.change(await screen.findByRole('slider', { name: 'Volume' }), {
      target: { value: '20' },
    })
    expect(dublê.salvar).not.toHaveBeenCalled()
    cleanup()
    expect(dublê.salvar).toHaveBeenCalledWith({
      Volume: 20,
      Sounds: [
        { Kind: 'Mention', Sound: 'Ping' },
        { Kind: 'Assignment', Sound: 'Bell' },
      ],
    })
    // E nao grava de novo depois.
    await esperar(500)
    expect(dublê.salvar).toHaveBeenCalledTimes(1)
  })

  it('a falha diz, e "Tentar de novo" manda o que esta na tela', async () => {
    dublê.salvar.mockRejectedValueOnce(new Error('fora do ar'))
    abrir()
    await escolherSom('Quando me escolhem como responsável', 'Gota')

    expect(await screen.findByText(/Não deu para salvar\./)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(2))
    expect(dublê.salvar).toHaveBeenLastCalledWith({
      Volume: 70,
      Sounds: [
        { Kind: 'Mention', Sound: 'Ping' },
        { Kind: 'Assignment', Sound: 'Drop' },
      ],
    })
    expect(await screen.findByText('Salvo.')).toBeTruthy()
    expect(screen.queryByText(/Não deu para salvar/)).toBeNull()
  })

  it('volume zero e "Mudo", e nao deixa ouvir', async () => {
    abrir()
    fireEvent.change(await screen.findByRole('slider', { name: 'Volume' }), {
      target: { value: '0' },
    })
    expect(screen.getByText('Mudo')).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Volume' }).getAttribute('aria-valuetext')).toBe(
      'Mudo',
    )
    expect(
      screen.getByRole('button', { name: 'Ouvir o som: quando alguém me menciona' }),
    ).toHaveProperty('disabled', true)
  })

  it('a falha ao carregar as preferencias deixa tentar de novo', async () => {
    dublê.ler.mockRejectedValueOnce(new Error('fora do ar'))
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('combobox', { name: 'Quando alguém me menciona' })).toBeTruthy()
  })
})

describe('a volta do Perfil', () => {
  afterEach(cleanup)
  beforeEach(() => {
    for (const d of Object.values(dublê)) d.mockReset()
    dublê.ler.mockResolvedValue(AJUSTES)
  })

  it('vindo de uma tela do painel, "Voltar" volta a ela', async () => {
    abrir('/projects/p-1/work')
    expect(screen.queryByRole('link', { name: /Projetos/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(await screen.findByText('Tela de Trabalho')).toBeTruthy()
  })

  it('aberto direto, "Projetos" leva aos projetos', async () => {
    abrir()
    expect(screen.queryByRole('button', { name: /Voltar/ })).toBeNull()
    const link = screen.getByRole('link', { name: /Projetos/ })
    expect(link.getAttribute('href')).toBe('/projects')
    fireEvent.click(link)
    expect(await screen.findByText('Tela dos projetos')).toBeTruthy()
  })
})
