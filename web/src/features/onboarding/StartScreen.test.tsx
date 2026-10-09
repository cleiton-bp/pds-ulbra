// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectKeyViewModel, ProjectViewModel } from '@/contracts'
import { StartScreen } from '@/features/onboarding/StartScreen'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A tela diz se ja esta funcionando.** Quem volta para conferir o script de um
 * projeto que ja recebe relatos via a mesma tela de um projeto que nunca recebeu
 * nada, e nao sabia se precisava fazer alguma coisa. O selo vem do ultimo relato que
 * chegou de fora — o mesmo dado que decide se esta tela e a porta do projeto — e
 * leva ao Trabalho. Sem relato, nao promete nada.
 *
 * **Os links usam os nomes do menu** (Projeto, Botao no site): uma frase dizendo
 * "mudar em Ferramenta" mandava procurar uma tela que nao existe mais com esse nome.
 */
const dublê = vi.hoisted(() => ({ chaves: vi.fn<() => Promise<ProjectKeyViewModel[]>>() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectKeyService: { ...real.projectKeyService, listProjectKeys: dublê.chaves },
  }
})

function projeto(ultimoRelato: string | null): ProjectViewModel {
  return {
    PublicId: 'p-1',
    Name: 'Loja',
    Status: 'Active',
    CreatedAt: '2026-10-01T12:00:00.000Z',
    UpdatedAt: '2026-10-01T12:00:00.000Z',
    Account: { PublicId: 'c-1', Name: 'Conta da Ana' },
    Role: 'Administrator',
    IsAccountOwner: true,
    LastReportReceivedAt: ultimoRelato,
    LastActivityAt: ultimoRelato,
  }
}

const PUBLICA: ProjectKeyViewModel = {
  PublicId: 'k-1',
  Type: 'Public',
  Value: 'pk_live_loja123',
  Prefix: 'pk_live_',
  IsActive: true,
  CreatedAt: '2026-10-01T12:00:00.000Z',
  RevokedAt: null,
  LastUsedAt: null,
}

function montar(project: ProjectViewModel) {
  const router = createMemoryRouter(
    [
      {
        path: '/projects/:publicId',
        element: <Outlet context={{ project }} />,
        children: [
          { path: 'start', element: <StartScreen /> },
          { path: '*', element: <p>outra tela</p> },
        ],
      },
    ],
    { initialEntries: ['/projects/p-1/start'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('StartScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.chaves.mockReset()
    dublê.chaves.mockResolvedValue([PUBLICA])
  })

  it('diz os três passos, com a chave pública no script', async () => {
    montar(projeto(null))

    expect(
      screen.getByText('Três passos para o seu site começar a mandar relatos para este projeto.'),
    ).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Copiar a chave pública' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Colar o script no site' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Fazer um relato de teste' })).toBeTruthy()
    expect(document.querySelector('pre')?.textContent).toContain('pk_live_loja123')
  })

  it('sem relato de fora ainda, não diz que está funcionando', async () => {
    montar(projeto(null))

    await screen.findByRole('heading', { name: 'Copiar a chave pública' })
    expect(screen.queryByText(/Funcionando/)).toBeNull()
  })

  it('depois do primeiro relato, o selo diz que funciona e leva ao Trabalho', async () => {
    const router = montar(projeto(new Date(Date.now() - 5 * 60 * 1000).toISOString()))

    const selo = await screen.findByRole('status')
    expect(selo.textContent).toMatch(/^Funcionando: o último relato chegou há 5 minutos\./)

    fireEvent.click(screen.getByRole('link', { name: 'Ver em Trabalho' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1/reports'))
  })

  it('os atalhos usam os nomes do menu: Projeto e Botão no site', async () => {
    montar(projeto(null))
    await screen.findByRole('heading', { name: 'Copiar a chave pública' })

    expect(screen.getByRole('link', { name: 'Projeto' }).getAttribute('href')).toBe(
      '/projects/p-1/settings',
    )
    expect(screen.getByRole('link', { name: 'Mudar em Botão no site' }).getAttribute('href')).toBe(
      '/projects/p-1/tool',
    )
    expect(screen.queryByText(/Ferramenta|Configurações/)).toBeNull()
  })
})
