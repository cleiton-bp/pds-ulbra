// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportLimitsViewModel, ReportLimitValues } from '@/contracts'
import { DomainsScreen } from '@/features/projects/DomainsScreen'

/**
 * O QUE ESTES TESTES TRAVAM: a tela de Domínios inteira, com a aba Proteção.
 *
 * - **O sino e a busca levam aos limites**: `#limites`, `#limite-por-ip`,
 *   `#intervalo-minimo` (e o antigo `#mais-opcoes`) escolhem a aba Proteção, mesmo com
 *   relato esperando — o alvo fica num painel visivel para a casca rolar ate ele.
 * - **Proteção e a ultima aba**: o End chega nela.
 * - **Trocar de aba nao perde o rascunho dos limites**, e o aviso de sair sem salvar
 *   continua de pe: o painel fica montado, so escondido.
 */
const dublê = vi.hoisted(() => ({
  pendentes: vi.fn(),
  lerLimites: vi.fn<() => Promise<ReportLimitsViewModel>>(),
}))

vi.mock('@/shared/hooks/useCurrentProject', () => ({
  useCurrentProject: () => ({ PublicId: 'p-1' }),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  const vazio = () => Promise.resolve([])

  return {
    ...real,
    projectOriginService: {
      listProjectOrigins: vazio,
      listObservedOrigins: vazio,
      listBlockedOrigins: vazio,
      listPendingOrigins: dublê.pendentes,
    },
    projectReportService: {},
    projectReportLimitsService: {
      getReportLimits: dublê.lerLimites,
      saveReportLimits: vi.fn(),
    },
  }
})

const fabrica: ReportLimitValues = {
  PerReporter: 5,
  PerIpPerHour: 20,
  PerOriginPerHour: 200,
  PerProjectPerHour: 300,
  PerProjectPerDay: 2000,
  MinIntervalSeconds: 30,
}

function montar(endereco: string) {
  const router = createMemoryRouter(
    [
      { path: '/p/domains', element: <DomainsScreen /> },
      { path: '/p/outra', element: <p>outra tela</p> },
    ],
    { initialEntries: [endereco] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const aba = (nome: string) => screen.getByRole('tab', { name: new RegExp(`^${nome}`) })
const selecionada = (nome: string) => aba(nome).getAttribute('aria-selected') === 'true'
const painelDe = (nome: string) =>
  document.getElementById(aba(nome).getAttribute('aria-controls') ?? '')

describe('DomainsScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.pendentes.mockReset()
    dublê.lerLimites.mockReset()
    // Com relato esperando: sem `#`, a tela abriria em Aguardando.
    dublê.pendentes.mockResolvedValue([
      { Domain: 'novo.com', ReportCount: 1, LastReportAt: '2026-10-09T12:00:00.000Z' },
    ])
    dublê.lerLimites.mockResolvedValue({
      Values: { ...fabrica, PerReporter: 8 },
      Defaults: fabrica,
      Ceilings: fabrica,
      PauseMinutes: 15,
    })
  })

  it('sem #, com relato esperando, abre em Aguardando', async () => {
    montar('/p/domains')
    await screen.findByText('novo.com')
    expect(selecionada('Aguardando')).toBe(true)
    expect(aba('Aguardando').textContent).toBe('Aguardando (1)')
  })

  it('o aviso do sino (#limites) abre na aba Proteção, com os limites visiveis', async () => {
    montar('/p/domains#limites')

    expect(selecionada('Proteção')).toBe(true)
    await screen.findByText('novo.com')
    expect(selecionada('Proteção')).toBe(true)

    const limites = document.getElementById('limites')
    expect(painelDe('Proteção')?.contains(limites)).toBe(true)
    expect(painelDe('Proteção')?.hidden).toBe(false)
    expect(await screen.findByText('1 mudança: Por pessoa a cada 10 min')).toBeTruthy()
  })

  it('cada limite da busca, e o antigo #mais-opcoes, levam a Proteção — tambem com a tela aberta', async () => {
    const router = montar('/p/domains#limite-por-ip')
    expect(selecionada('Proteção')).toBe(true)
    await waitFor(() =>
      expect(painelDe('Proteção')?.contains(document.getElementById('limite-por-ip'))).toBe(true),
    )

    fireEvent.click(aba('Autorizados'))
    await act(() => router.navigate('/p/domains#intervalo-minimo'))
    expect(selecionada('Proteção')).toBe(true)
    expect(painelDe('Proteção')?.contains(document.getElementById('intervalo-minimo'))).toBe(true)

    fireEvent.click(aba('Histórico'))
    await act(() => router.navigate('/p/domains#mais-opcoes'))
    expect(selecionada('Proteção')).toBe(true)
    expect(painelDe('Proteção')?.contains(document.getElementById('mais-opcoes'))).toBe(true)

    // E o sino dos retidos volta para Aguardando.
    await act(() => router.navigate('/p/domains#dominios'))
    expect(selecionada('Aguardando')).toBe(true)
  })

  it('Proteção é a última aba: o End chega nela', async () => {
    montar('/p/domains')
    await screen.findByText('novo.com')

    fireEvent.keyDown(aba('Aguardando'), { key: 'End' })
    expect(selecionada('Proteção')).toBe(true)
    expect(document.activeElement).toBe(aba('Proteção'))
  })

  it('trocar de aba não perde o rascunho dos limites, e sair sem salvar ainda pergunta', async () => {
    const router = montar('/p/domains#limites')
    fireEvent.click(await screen.findByRole('button', { name: 'Alterar limites' }))
    const porPessoa = screen.getByRole('spinbutton', { name: 'Por pessoa a cada 10 min' })
    fireEvent.change(porPessoa, { target: { value: '12' } })

    fireEvent.click(aba('Autorizados'))
    expect(painelDe('Proteção')?.hidden).toBe(true)
    fireEvent.click(aba('Proteção'))

    expect(
      (screen.getByRole('spinbutton', { name: 'Por pessoa a cada 10 min' }) as HTMLInputElement)
        .value,
    ).toBe('12')

    // Com o rascunho mudado, ir para outra tela pergunta — mesmo vindo de outra aba.
    fireEvent.click(aba('Bloqueados'))
    await act(() => router.navigate('/p/outra'))
    expect(await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/p/domains')
  })
})
