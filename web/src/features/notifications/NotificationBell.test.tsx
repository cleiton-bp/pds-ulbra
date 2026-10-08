// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationViewModel } from '@/contracts'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { UNREAD_POLL_MS } from '@/features/notifications/useUnreadCount'
import { announceNotificationArrival } from '@/shared/lib/notificationSounds'

/**
 * O QUE ESTES TESTES TRAVAM: o sino.
 *
 * - **O numero vem da API**, com a palavra para quem nao ve o numero — e volta a ser
 *   perguntado a cada minuto com a aba a vista.
 * - **A lista e lida ao abrir**: quem fez, o que fez, o card e o projeto.
 * - **Abrir o aviso leva ao card** e o marca como lido; "Marcar todos" zera o numero.
 * - **A resposta atrasada nao passa por cima** do numero que uma acao devolveu.
 * - **O numero que sobe toca o som** do tipo do aviso mais novo, no volume da pessoa — e o
 *   primeiro numero da tela nao toca.
 * - **O aviso que chega pelo tempo real** faz o sino perguntar na hora.
 * - **"Preferencias de aviso" leva ao Perfil.**
 */
const dublê = vi.hoisted(() => ({
  contar: vi.fn(),
  listar: vi.fn(),
  ler: vi.fn(),
  lerTudo: vi.fn(),
  preferencias: vi.fn(),
  salvar: vi.fn(),
}))

const som = vi.hoisted(() => ({ tocar: vi.fn() }))

vi.mock('@/shared/lib/notificationSounds', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/shared/lib/notificationSounds')>()
  return { ...real, playNotificationSound: som.tocar }
})

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    notificationService: {
      countUnread: dublê.contar,
      listNotifications: dublê.listar,
      markRead: dublê.ler,
      markAllRead: dublê.lerTudo,
      getSettings: dublê.preferencias,
      saveSettings: dublê.salvar,
    },
  }
})

function aviso(extra: Partial<NotificationViewModel> = {}): NotificationViewModel {
  return {
    PublicId: 'n-1',
    Kind: 'Mention',
    CreatedAt: '2026-10-03T12:00:00.000Z',
    ReadAt: null,
    ActorName: 'Ana Dona',
    Project: { PublicId: 'p-1', Name: 'Loja Online' },
    Card: { PublicId: 'c-42', Number: 42, Headline: 'Revisar o checkout' },
    ...extra,
  }
}

function Onde() {
  return <span data-testid="onde">{useLocation().pathname}</span>
}

function montar() {
  render(
    <MemoryRouter initialEntries={['/projects/p-1']}>
      <NotificationBell />
      <Routes>
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  )
}

const abrirMenu = (botao: HTMLElement) =>
  fireEvent.pointerDown(botao, { button: 0, ctrlKey: false, pointerType: 'mouse' })

describe('o sino', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })
  beforeEach(() => {
    for (const dublé of Object.values(dublê)) dublé.mockReset()
    som.tocar.mockReset()
  })

  it('o número vem da API, com a palavra; e é perguntado de novo a cada minuto', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    dublê.contar.mockResolvedValueOnce({ UnreadCount: 2 }).mockResolvedValue({ UnreadCount: 3 })
    montar()

    expect(await screen.findByRole('button', { name: 'Avisos: 2 não lidos' })).toBeTruthy()
    await act(async () => {
      vi.advanceTimersByTime(UNREAD_POLL_MS)
    })
    expect(await screen.findByRole('button', { name: 'Avisos: 3 não lidos' })).toBeTruthy()
  })

  it('a lista vem ao abrir; abrir o aviso leva ao card e marca como lido', async () => {
    dublê.contar.mockResolvedValue({ UnreadCount: 2 })
    dublê.listar.mockResolvedValue({
      Items: [
        aviso(),
        aviso({ PublicId: 'n-2', Kind: 'Assignment', ReadAt: '2026-10-03T13:00:00.000Z' }),
      ],
      UnreadCount: 1,
    })
    dublê.ler.mockResolvedValue({ UnreadCount: 0 })
    montar()

    abrirMenu(await screen.findByRole('button', { name: 'Avisos: 2 não lidos' }))
    const mencao = await screen.findByRole('menuitem', {
      name: /Ana Dona mencionou você em #42 Revisar o checkout.*Loja Online.*não lido/,
    })
    expect(
      screen.getByRole('menuitem', { name: /escolheu você como responsável por #42/ }),
    ).toBeTruthy()

    fireEvent.click(mencao)
    await waitFor(() =>
      expect(screen.getByTestId('onde').textContent).toBe('/projects/p-1/reports/c-42'),
    )
    expect(dublê.ler).toHaveBeenCalledWith('n-1')
    expect(await screen.findByRole('button', { name: 'Avisos' })).toBeTruthy()
  })

  it('"Marcar todos como lidos" zera o número; a pergunta que chega atrasada não volta com ele', async () => {
    let responder: (valor: { UnreadCount: number }) => void = () => {}
    dublê.contar
      .mockResolvedValueOnce({ UnreadCount: 1 })
      .mockImplementationOnce(() => new Promise((resolve) => (responder = resolve)))
    dublê.listar.mockResolvedValue({ Items: [aviso()], UnreadCount: 1 })
    dublê.lerTudo.mockResolvedValue({ UnreadCount: 0 })
    montar()

    const sino = await screen.findByRole('button', { name: 'Avisos: 1 não lido' })
    // Uma pergunta sai (a aba voltou), e fica no ar.
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    abrirMenu(sino)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Marcar todos como lidos' }))
    expect(await screen.findByRole('button', { name: 'Avisos' })).toBeTruthy()

    await act(async () => responder({ UnreadCount: 1 }))
    expect(screen.getByRole('button', { name: 'Avisos' })).toBeTruthy()
  })
})

describe('o som e o tempo real do sino', () => {
  const AJUSTES = {
    Volume: 40,
    Sounds: [
      { Kind: 'Mention' as const, Sound: 'Drop' as const },
      { Kind: 'Assignment' as const, Sound: 'Chime' as const },
    ],
  }

  // Cada teste com o seu relogio, longe do anterior: o som toca no maximo a cada
  // poucos segundos, e o limite e do modulo.
  let relogio = Date.now() + 3_600_000
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })
  beforeEach(() => {
    for (const dublé of Object.values(dublê)) dublé.mockReset()
    som.tocar.mockReset()
    dublê.preferencias.mockResolvedValue(AJUSTES)
    relogio += 600_000
    vi.useFakeTimers({ shouldAdvanceTime: true, now: relogio })
  })

  it('o primeiro número não toca; o que sobe toca o som do tipo do aviso mais novo, no volume da pessoa', async () => {
    dublê.contar.mockResolvedValueOnce({ UnreadCount: 1 }).mockResolvedValue({ UnreadCount: 2 })
    dublê.listar.mockResolvedValue({
      Items: [
        aviso({ PublicId: 'n-2', Kind: 'Assignment', CreatedAt: new Date().toISOString() }),
        aviso({ ReadAt: '2026-10-03T13:00:00.000Z' }),
      ],
      UnreadCount: 2,
    })
    montar()
    expect(await screen.findByRole('button', { name: 'Avisos: 1 não lido' })).toBeTruthy()
    expect(som.tocar).not.toHaveBeenCalled()

    // O aviso chega pelo tempo real: o sino pergunta na hora, sem esperar o minuto.
    await act(async () => announceNotificationArrival())
    expect(await screen.findByRole('button', { name: 'Avisos: 2 não lidos' })).toBeTruthy()
    await waitFor(() => expect(som.tocar).toHaveBeenCalledWith('Chime', 40))
    expect(som.tocar).toHaveBeenCalledTimes(1)
  })

  it('"Preferências de aviso" leva ao Perfil', async () => {
    dublê.contar.mockResolvedValue({ UnreadCount: 0 })
    dublê.listar.mockResolvedValue({ Items: [], UnreadCount: 0 })
    montar()
    abrirMenu(await screen.findByRole('button', { name: /^Avisos/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Preferências de aviso' }))
    await waitFor(() => expect(screen.getByTestId('onde').textContent).toBe('/profile'))
  })

  it('o aviso velho que volta a contar nao toca', async () => {
    dublê.contar.mockResolvedValueOnce({ UnreadCount: 0 }).mockResolvedValue({ UnreadCount: 1 })
    dublê.listar.mockResolvedValue({
      Items: [aviso({ PublicId: 'n-velho', CreatedAt: '2026-01-01T12:00:00.000Z' })],
      UnreadCount: 1,
    })
    montar()
    await screen.findByRole('button', { name: 'Avisos' })
    await act(async () => announceNotificationArrival())
    expect(await screen.findByRole('button', { name: 'Avisos: 1 não lido' })).toBeTruthy()
    await waitFor(() => expect(dublê.listar).toHaveBeenCalled())
    expect(som.tocar).not.toHaveBeenCalled()
  })
})
