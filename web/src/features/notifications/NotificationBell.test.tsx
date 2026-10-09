// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationViewModel } from '@/contracts'
import { PanelError } from '@/data/errors'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { UNREAD_POLL_MS } from '@/features/notifications/useUnreadCount'
import { useToastStore } from '@/shared/components/toastStore'
import { announceNotificationArrival } from '@/shared/lib/notificationSounds'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

instalarRemendosDoRadix()

/**
 * O QUE ESTES TESTES TRAVAM: o sino.
 *
 * - **O numero vem da API**, com a palavra para quem nao ve o numero — e volta a ser
 *   perguntado a cada minuto com a aba a vista.
 * - **A lista e lida ao abrir**: quem fez, o que fez, o card e o projeto — **so os nao
 *   lidos, de saida** (S-10); "Todos" le de novo com os lidos, sem fechar o sino. O nao
 *   lido vem em negrito, alem do ponto.
 * - **"Ver os mais antigos" alcanca o resto** (S-09): a pagina seguinte, depois do ultimo
 *   aviso da tela, sem repetir — o numero do sino nunca promete o que a lista nao alcanca.
 * - **Tres ou mais iguais seguidos viram uma linha** (S-10): o mesmo tipo, a mesma pessoa,
 *   o mesmo projeto, em ate dez minutos; "Ver" abre cada um.
 * - **A mencao mostra o trecho do comentario e leva ate ele** (S-08); sair desiste.
 * - **Abrir o aviso leva ao card** e o marca como lido; "Marcar todos" zera o numero, e
 *   so aparece com a lista na tela; a lista que falha diz e tenta de novo (S-23).
 * - **A resposta atrasada nao passa por cima** do numero que uma acao devolveu.
 * - **O numero que sobe toca o som** do tipo do aviso mais novo, no volume da pessoa — e o
 *   primeiro numero da tela nao toca. O mais novo e procurado so entre os nao lidos.
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

// Levar ate o comentario tem os testes dele (`revealComment.test.ts`): aqui, so quem
// o sino chama e quando desiste.
const revelar = vi.hoisted(() => ({ ate: vi.fn(), desistir: vi.fn() }))

vi.mock('@/features/notifications/revealComment', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/notifications/revealComment')>()
  return { ...real, revealComment: revelar.ate }
})

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
    Comment: null,
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
    // O mais novo e procurado so entre os nao lidos: com muitos lidos depois dele, a
    // primeira pagina de todos podia nao ter o nao lido nenhum (S-09).
    expect(dublê.listar).toHaveBeenCalledWith({ unreadOnly: true })
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

describe('a lista do sino', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })
  beforeEach(() => {
    for (const dublé of Object.values(dublê)) dublé.mockReset()
    som.tocar.mockReset()
    revelar.ate.mockReset()
    revelar.desistir.mockReset()
    revelar.ate.mockReturnValue(revelar.desistir)
    useToastStore.setState({ toasts: [] })
  })

  /**
   * Um aviso do card `n`, com o numero e o titulo dele — uma hora mais velho a cada `n`:
   * avisos iguais perto no tempo viram uma linha so, e aqui cada um e o seu.
   */
  const doCard = (n: number, extra: Partial<NotificationViewModel> = {}) =>
    aviso({
      PublicId: `n-${n}`,
      CreatedAt: new Date(Date.parse('2026-10-03T12:00:00.000Z') - n * 3_600_000).toISOString(),
      Card: { PublicId: `c-${n}`, Number: n, Headline: `Card ${n}` },
      ...extra,
    })

  it('de saida, so os nao lidos; "Todos" le de novo com os lidos, e o sino fica aberto', async () => {
    dublê.contar.mockResolvedValue({ UnreadCount: 1 })
    dublê.listar.mockImplementation(async (opcoes?: { unreadOnly?: boolean }) =>
      opcoes?.unreadOnly
        ? { Items: [doCard(1)], UnreadCount: 1, HasMore: false }
        : {
            Items: [
              doCard(1),
              doCard(2, { Kind: 'Assignment', ReadAt: '2026-10-03T13:00:00.000Z' }),
            ],
            UnreadCount: 1,
            HasMore: false,
          },
    )
    montar()
    abrirMenu(await screen.findByRole('button', { name: 'Avisos: 1 não lido' }))

    const naoLido = await screen.findByRole('menuitem', { name: /mencionou você em #1 Card 1/ })
    expect(dublê.listar).toHaveBeenCalledWith({ unreadOnly: true })
    expect(
      screen.getByRole('menuitemradio', { name: 'Não lidos (1)' }).getAttribute('aria-checked'),
    ).toBe('true')
    expect(screen.queryByRole('menuitem', { name: /#2 Card 2/ })).toBeNull()
    // O nao lido em negrito, alem do ponto: no escuro, o ponto sozinho mal se via.
    expect(within(naoLido).getByText(/mencionou você em/).className).toContain('font-semibold')

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Todos' }))
    const lido = await screen.findByRole('menuitem', {
      name: /escolheu você como responsável por #2 Card 2/,
    })
    expect(dublê.listar).toHaveBeenLastCalledWith({ unreadOnly: false })
    expect(screen.getByRole('menuitemradio', { name: 'Todos' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(within(lido).getByText(/escolheu você/).className).not.toContain('font-semibold')
    // Escolher a aba nao fecha o sino.
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('sem nenhum, cada aba diz o seu vazio', async () => {
    dublê.contar.mockResolvedValue({ UnreadCount: 0 })
    dublê.listar.mockResolvedValue({ Items: [], UnreadCount: 0, HasMore: false })
    montar()
    abrirMenu(await screen.findByRole('button', { name: 'Avisos' }))
    expect(await screen.findByText('Nenhum aviso não lido.')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Todos' }))
    expect(await screen.findByText('Nenhum aviso por aqui.')).toBeTruthy()
  })

  it('"Ver os mais antigos" traz a pagina seguinte, depois do ultimo aviso da tela, sem repetir', async () => {
    dublê.contar.mockResolvedValue({ UnreadCount: 3 })
    dublê.listar
      .mockResolvedValueOnce({ Items: [doCard(1), doCard(2)], UnreadCount: 3, HasMore: true })
      .mockRejectedValueOnce(new PanelError('Erro 500.', 500))
      .mockResolvedValueOnce({ Items: [doCard(2), doCard(3)], UnreadCount: 3, HasMore: false })
    montar()
    abrirMenu(await screen.findByRole('button', { name: 'Avisos: 3 não lidos' }))

    // A falha diz, e o botao fica para tentar de novo.
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ver os não lidos mais antigos' }))
    await waitFor(() =>
      expect(useToastStore.getState().toasts.at(-1)?.message).toBe(
        'Não deu para concluir agora. Tente de novo.',
      ),
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ver os não lidos mais antigos' }))

    expect(await screen.findByRole('menuitem', { name: /#3 Card 3/ })).toBeTruthy()
    // Com a hora do ultimo junto: se ele sumiu (o comentario apagado, a pessoa fora do
    // projeto), a API segue por ela, em vez de responder 404 toda vez.
    expect(dublê.listar).toHaveBeenLastCalledWith({
      unreadOnly: true,
      before: 'n-2',
      beforeAt: '2026-10-03T10:00:00.000Z',
    })
    // Pela hora e pela chave, e nao por posicao: o que ja estava na tela nao se repete.
    expect(screen.getAllByRole('menuitem', { name: /#2 Card 2/ })).toHaveLength(1)
    // Acabou: nao ha mais o que buscar.
    expect(screen.queryByRole('menuitem', { name: /mais antigos/ })).toBeNull()
    // O sino continua aberto durante tudo isso.
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('em "Todos", "Ver os mais antigos" busca tambem os lidos', async () => {
    dublê.contar.mockResolvedValue({ UnreadCount: 0 })
    dublê.listar
      .mockResolvedValueOnce({ Items: [], UnreadCount: 0, HasMore: false })
      .mockResolvedValueOnce({
        Items: [doCard(1, { ReadAt: '2026-10-03T13:00:00.000Z' })],
        UnreadCount: 0,
        HasMore: true,
      })
      .mockResolvedValueOnce({
        Items: [doCard(2, { ReadAt: '2026-10-03T13:00:00.000Z' })],
        UnreadCount: 0,
        HasMore: false,
      })
    montar()
    abrirMenu(await screen.findByRole('button', { name: 'Avisos' }))
    await screen.findByText('Nenhum aviso não lido.')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Todos' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ver os mais antigos' }))
    expect(await screen.findByRole('menuitem', { name: /#2 Card 2/ })).toBeTruthy()
    expect(dublê.listar).toHaveBeenLastCalledWith({
      unreadOnly: false,
      before: 'n-1',
      beforeAt: '2026-10-03T11:00:00.000Z',
    })
  })

  it('tres ou mais iguais seguidos, em ate dez minutos, viram uma linha; "Ver" abre cada um', async () => {
    const base = Date.parse('2026-10-08T15:00:00.000Z')
    const em = (minutosAntes: number) => new Date(base - minutosAntes * 60_000).toISOString()
    const doBruno = (n: number, minutosAntes: number, extra: Partial<NotificationViewModel> = {}) =>
      doCard(n, {
        Kind: 'Assignment',
        ActorName: 'Bruno Membro',
        CreatedAt: em(minutosAntes),
        ...extra,
      })
    dublê.contar.mockResolvedValue({ UnreadCount: 16 })
    dublê.ler.mockResolvedValue({ UnreadCount: 15 })
    dublê.listar.mockResolvedValue({
      Items: [
        // Sete atribuicoes do Bruno em seis minutos: uma linha.
        ...[1, 2, 3, 4, 5, 6, 7].map((n) => doBruno(n, n - 1)),
        // Outra pessoa corta a sequencia.
        doCard(8, { Kind: 'Assignment', ActorName: 'Ana Dona', CreatedAt: em(10) }),
        // Duas seguidas ainda se leem uma a uma.
        doBruno(9, 20),
        doBruno(10, 21),
        // Tres mencoes: "mencionou voce 3 vezes".
        ...[11, 12, 13].map((n) => doBruno(n, 30 + n - 11, { Kind: 'Mention' })),
        // Mais de dez minutos entre a primeira e a terceira: nao juntam.
        doBruno(14, 40),
        doBruno(15, 45),
        doBruno(16, 55),
      ],
      UnreadCount: 16,
      HasMore: false,
    })
    montar()
    abrirMenu(await screen.findByRole('button', { name: 'Avisos: 16 não lidos' }))

    const grupo = await screen.findByRole('menuitem', {
      name: /^Bruno Membro escolheu você como responsável por 7 cards/,
    })
    expect(grupo.getAttribute('aria-expanded')).toBe('false')
    expect(grupo.textContent).toContain('Ver')
    expect(screen.queryByRole('menuitem', { name: /#3 Card 3/ })).toBeNull()
    expect(
      screen.getByRole('menuitem', { name: /^Bruno Membro mencionou você 3 vezes/ }),
    ).toBeTruthy()
    for (const n of [8, 9, 10, 14, 15, 16])
      expect(screen.getByRole('menuitem', { name: new RegExp(`#${n} Card ${n}`) })).toBeTruthy()

    // "Ver" abre os sete ali mesmo, sem fechar o sino; cada um abre o seu card.
    fireEvent.click(grupo)
    expect(grupo.getAttribute('aria-expanded')).toBe('true')
    expect(grupo.textContent).toContain('Esconder')
    for (const n of [1, 2, 3, 4, 5, 6, 7])
      expect(
        screen.getByRole('menuitem', {
          name: new RegExp(`Bruno Membro escolheu você como responsável por #${n} Card ${n}`),
        }),
      ).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: /#3 Card 3/ }))
    await waitFor(() =>
      expect(screen.getByTestId('onde').textContent).toBe('/projects/p-1/reports/c-3'),
    )
    expect(dublê.ler).toHaveBeenCalledWith('n-3')
  })

  it('a mencao mostra o trecho do comentario; abrir leva ao card e ate o comentario, e sair desiste', async () => {
    dublê.contar.mockResolvedValue({ UnreadCount: 1 })
    dublê.ler.mockResolvedValue({ UnreadCount: 0 })
    dublê.listar.mockResolvedValue({
      Items: [
        aviso({ Comment: { PublicId: 'k-9', Excerpt: 'Pode olhar o @Bruno antes de sexta?' } }),
      ],
      UnreadCount: 1,
      HasMore: false,
    })
    montar()
    abrirMenu(await screen.findByRole('button', { name: 'Avisos: 1 não lido' }))

    const mencao = await screen.findByRole('menuitem', {
      name: /#42 Revisar o checkout.*“Pode olhar o @Bruno antes de sexta\?”.*Loja Online/,
    })
    fireEvent.click(mencao)
    await waitFor(() =>
      expect(screen.getByTestId('onde').textContent).toBe('/projects/p-1/reports/c-42'),
    )
    expect(revelar.ate).toHaveBeenCalledWith('k-9')
    expect(revelar.desistir).not.toHaveBeenCalled()
    // A tela que sai nao fica esperando o comentario aparecer.
    cleanup()
    expect(revelar.desistir).toHaveBeenCalled()
  })

  it('a atribuicao nao tem comentario: abrir so leva ao card', async () => {
    dublê.contar.mockResolvedValue({ UnreadCount: 1 })
    dublê.ler.mockResolvedValue({ UnreadCount: 0 })
    dublê.listar.mockResolvedValue({
      Items: [aviso({ Kind: 'Assignment' })],
      UnreadCount: 1,
      HasMore: false,
    })
    montar()
    abrirMenu(await screen.findByRole('button', { name: 'Avisos: 1 não lido' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /escolheu você/ }))
    await waitFor(() =>
      expect(screen.getByTestId('onde').textContent).toBe('/projects/p-1/reports/c-42'),
    )
    expect(revelar.ate).not.toHaveBeenCalled()
  })

  it('a lista que falha diz e tenta de novo; "Marcar todos" so aparece com a lista na tela', async () => {
    let responder: (valor: unknown) => void = () => {}
    dublê.contar.mockResolvedValue({ UnreadCount: 2 })
    dublê.listar
      .mockRejectedValueOnce(new Error('fora do ar'))
      .mockImplementationOnce(() => new Promise((resolve) => (responder = resolve)))
    montar()
    abrirMenu(await screen.findByRole('button', { name: 'Avisos: 2 não lidos' }))

    expect(await screen.findByText('Não deu para carregar os avisos.')).toBeTruthy()
    // Marcar sem ver o que se marca nao e escolha.
    expect(screen.queryByRole('menuitem', { name: 'Marcar todos como lidos' })).toBeNull()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Carregando…')).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Marcar todos como lidos' })).toBeNull()
    await act(async () =>
      responder({ Items: [aviso(), doCard(2)], UnreadCount: 2, HasMore: false }),
    )
    expect(await screen.findByRole('menuitem', { name: /#42 Revisar o checkout/ })).toBeTruthy()
    expect(screen.queryByText('Não deu para carregar os avisos.')).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Marcar todos como lidos' })).toBeTruthy()
  })
})
