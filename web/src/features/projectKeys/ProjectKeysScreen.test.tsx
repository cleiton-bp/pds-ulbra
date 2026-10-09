// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectKeyViewModel, ProjectViewModel, RevealedSecretKeyViewModel } from '@/contracts'
import { ProjectKeysScreen } from '@/features/projectKeys/ProjectKeysScreen'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A secreta nasce sob pedido.** O projeto novo vem so com a publica: a secreta
 * aparece uma vez so, e nascer junto do projeto obrigava quem acabou de cria-lo a
 * decidir o que fazer com um valor que quase ninguem usa. Sem secreta, a tela diz
 * que nao ha, e gerar a primeira e **neutro** — avisa que o valor aparece uma vez, sem
 * o ambar de quem vai trocar uma chave em uso. Trocar a que existe continua dizendo
 * que a de hoje para de funcionar.
 *
 * **Depois de gerar, o valor esta na tela uma vez so**: sair pergunta antes.
 */
const dublê = vi.hoisted(() => ({
  chaves: vi.fn<() => Promise<ProjectKeyViewModel[]>>(),
  gerar: vi.fn<() => Promise<RevealedSecretKeyViewModel>>(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectKeyService: {
      ...real.projectKeyService,
      listProjectKeys: dublê.chaves,
      regenerateSecretKey: dublê.gerar,
    },
  }
})

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: '2026-10-01T12:00:00.000Z',
  UpdatedAt: '2026-10-01T12:00:00.000Z',
  Account: { PublicId: 'c-1', Name: 'Conta da Ana' },
  Role: 'Administrator',
  IsAccountOwner: true,
  LastReportReceivedAt: null,
  LastActivityAt: null,
}

function chave(tipo: ProjectKeyViewModel['Type'], mudanca: Partial<ProjectKeyViewModel> = {}) {
  return {
    PublicId: `k-${tipo}`,
    Type: tipo,
    Value: tipo === 'Public' ? 'pk_live_loja123' : null,
    Prefix: tipo === 'Public' ? 'pk_live_' : 'sk_live_',
    IsActive: true,
    CreatedAt: '2026-10-01T12:00:00.000Z',
    RevokedAt: null,
    LastUsedAt: null,
    ...mudanca,
  } satisfies ProjectKeyViewModel
}

const NOVA: RevealedSecretKeyViewModel = {
  PublicId: 'k-nova',
  Value: 'sk_live_segredo_que_aparece_uma_vez',
  Prefix: 'sk_live_',
  CreatedAt: '2026-10-08T12:00:00.000Z',
}

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/projects/:publicId',
        element: <Outlet context={{ project: projeto }} />,
        children: [
          { path: 'keys', element: <ProjectKeysScreen /> },
          { path: '*', element: <p>outra tela</p> },
        ],
      },
    ],
    { initialEntries: ['/projects/p-1/keys'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

// A secao avancada rola ate a chave nova (`scrollIntoView`), que o jsdom nao tem.
instalarRemendosDoRadix()

async function abrirIntegracaoAvancada() {
  fireEvent.click(await screen.findByRole('button', { name: /Integração avançada/ }))
}

describe('ProjectKeysScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.chaves.mockReset()
    dublê.gerar.mockReset()
  })

  it('projeto sem secreta diz que ainda não tem, e oferece gerar a primeira', async () => {
    dublê.chaves.mockResolvedValue([chave('Public')])
    montar()

    await abrirIntegracaoAvancada()

    expect(screen.getByText(/Este projeto ainda não tem chave secreta/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Gerar chave secreta' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Gerar nova chave' })).toBeNull()
  })

  it('gerar a primeira é neutro: só avisa que o valor aparece uma vez', async () => {
    dublê.chaves.mockResolvedValue([chave('Public')])
    dublê.gerar.mockResolvedValue(NOVA)
    montar()

    await abrirIntegracaoAvancada()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar chave secreta' }))

    const pergunta = await screen.findByRole('alertdialog', { name: 'Gerar chave secreta' })
    expect(within(pergunta).getByText(/O valor completo aparece uma única vez/)).toBeTruthy()
    // Nao ha chave em uso para parar: nada de aviso de troca.
    expect(within(pergunta).queryByText(/para de funcionar/)).toBeNull()

    fireEvent.click(within(pergunta).getByRole('button', { name: 'Gerar chave' }))

    await waitFor(() => expect(dublê.gerar).toHaveBeenCalledWith('p-1'))
    expect(await screen.findByText(/Copie a chave agora/)).toBeTruthy()
    // A lista e relida: a secreta nova passa a existir nela.
    await waitFor(() => expect(dublê.chaves).toHaveBeenCalledTimes(2))
  })

  it('com uma secreta valendo, gerar outra avisa que a de hoje para de funcionar', async () => {
    dublê.chaves.mockResolvedValue([chave('Public'), chave('Secret')])
    montar()

    await abrirIntegracaoAvancada()
    expect(screen.getByText('sk_live_•••')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar nova chave' }))

    const pergunta = await screen.findByRole('alertdialog', { name: 'Gerar nova chave secreta' })
    expect(within(pergunta).getByText(/A chave de hoje para de funcionar/)).toBeTruthy()
    expect(dublê.gerar).not.toHaveBeenCalled()
  })

  it('com a chave nova na tela, sair pergunta antes', async () => {
    dublê.chaves.mockResolvedValue([chave('Public')])
    dublê.gerar.mockResolvedValue(NOVA)
    const router = montar()

    await abrirIntegracaoAvancada()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar chave secreta' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Gerar chave' }),
    )
    await screen.findByText(/Copie a chave agora/)

    await act(async () => {
      await router.navigate('/projects/p-1/start')
    })

    expect(
      await screen.findByRole('alertdialog', { name: 'A chave nova ainda está na tela' }),
    ).toBeTruthy()
    expect(router.state.location.pathname).toBe('/projects/p-1/keys')
  })
})
