// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectViewModel } from '@/contracts'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * Quem e so membro nao ve a parte de Configuração no menu do projeto — decidido
 * assim: escondida, e nao travada nem so de leitura. A API recusa o que ele
 * tentasse mudar; mostrar as telas seria convidar a um "salvar" que nunca salva.
 * Quem administra continua vendo tudo.
 *
 * O "Projeto nao encontrado" fala de time, e nao de conta: a pessoa pode estar em
 * projetos de varias contas, e "nao pertence a esta conta" deixou de fazer sentido.
 */
const dublê = vi.hoisted(() => {
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

  return {
    abrir: vi.fn<(publicId: string) => Promise<ProjectViewModel>>(),
    listar: vi.fn<() => Promise<ProjectViewModel[]>>(),
  }
})

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectService: { ...real.projectService, getProject: dublê.abrir, listProjects: dublê.listar },
  }
})

const { ProjectShell } = await import('@/app/ProjectShell')
const { useProjectsStore } = await import('@/features/projects/projectsStore')
const { PanelError } = await import('@/data/errors')
const { TooltipProvider } = await import('@/shared/components/Tooltip')

function projeto(role: ProjectViewModel['Role'], dono: boolean): ProjectViewModel {
  return {
    PublicId: 'p-1',
    Name: 'Loja Online',
    Status: 'Active',
    CreatedAt: '2026-10-01T12:00:00.000Z',
    UpdatedAt: '2026-10-01T12:00:00.000Z',
    Account: { PublicId: 'c-ana', Name: 'Conta da Ana' },
    Role: role,
    IsAccountOwner: dono,
  }
}

function abrir() {
  const router = createMemoryRouter(
    [
      {
        path: '/projects/:publicId',
        element: <ProjectShell />,
        children: [{ path: 'reports', element: <p>tela de relatos</p> }],
      },
      { path: '/projects', element: <p>hub</p> },
    ],
    { initialEntries: ['/projects/p-1/reports'] },
  )
  // O app monta o provedor de dicas em volta de tudo (main.tsx); os cadeados do
  // menu sao dicas.
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  )
}

describe('ProjectShell', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.abrir.mockReset()
    dublê.listar.mockReset()
    useProjectsStore.getState().reset()
  })

  it('para quem é só membro, o menu não tem a parte de Configuração', async () => {
    dublê.abrir.mockResolvedValue(projeto('Member', false))
    dublê.listar.mockResolvedValue([projeto('Member', false)])
    abrir()

    expect(await screen.findByText('tela de relatos')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Trabalho/ })).toBeTruthy()
    expect(screen.queryByText('Configuração')).toBeNull()
    expect(screen.queryByRole('link', { name: /Instalação/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Chaves/ })).toBeNull()
  })

  it('para quem administra, a Configuração continua no menu', async () => {
    dublê.abrir.mockResolvedValue(projeto('Administrator', false))
    dublê.listar.mockResolvedValue([projeto('Administrator', false)])
    abrir()

    expect(await screen.findByText('tela de relatos')).toBeTruthy()
    expect(screen.getByText('Configuração')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Instalação/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Chaves/ })).toBeTruthy()
  })

  it('projeto em que a pessoa não está: fala de time, e não de conta', async () => {
    dublê.abrir.mockRejectedValue(new PanelError('Projeto nao encontrado.', 404))
    dublê.listar.mockResolvedValue([])
    abrir()

    expect(await screen.findByText('Projeto não encontrado')).toBeTruthy()
    expect(screen.getByText('Ele não existe, ou você não está no time dele.')).toBeTruthy()
  })
})
