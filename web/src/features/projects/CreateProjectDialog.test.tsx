// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCreatedViewModel, ProjectViewModel } from '@/contracts'
import { CreateProjectDialog } from '@/features/projects/CreateProjectDialog'
import { useProjectsStore } from '@/features/projects/projectsStore'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Criar leva a Instalacao**, e nao as chaves. Ja foi para as chaves, com a secreta
 * na frente e um aviso de perda ao sair: o primeiro minuto do projeto ia numa chave
 * que quase ninguem usa. A proxima coisa a fazer e copiar a chave publica e colar o
 * script — e a descricao do dialogo diz isso antes do botao.
 *
 * O nome repetido na propria conta e recusado na hora; o resto e a API que decide, e a
 * recusa dela aparece no campo, acentuada.
 */
const dublê = vi.hoisted(() => ({ criar: vi.fn<(nome: string) => Promise<unknown>>() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectService: {
      ...real.projectService,
      createProject: (nome: string) => dublê.criar(nome),
    },
  }
})

function projeto(publicId: string, name: string, dono = true): ProjectViewModel {
  return {
    PublicId: publicId,
    Name: name,
    Status: 'Active',
    CreatedAt: '2026-10-08T12:00:00.000Z',
    UpdatedAt: '2026-10-08T12:00:00.000Z',
    Account: { PublicId: 'c-1', Name: 'Conta da Ana' },
    Role: 'Administrator',
    IsAccountOwner: dono,
    LastReportReceivedAt: null,
    LastActivityAt: null,
  }
}

function criado(publicId: string, name: string): ProjectCreatedViewModel {
  return {
    Project: projeto(publicId, name),
    PublicKey: {
      PublicId: 'k-1',
      Type: 'Public',
      Value: 'pk_live_novo',
      Prefix: 'pk_live_',
      IsActive: true,
      CreatedAt: '2026-10-08T12:00:00.000Z',
      RevokedAt: null,
      LastUsedAt: null,
    },
  }
}

function montar() {
  const router = createMemoryRouter(
    [
      { path: '/projects', element: <CreateProjectDialog open onOpenChange={() => {}} /> },
      { path: '/projects/:publicId/start', element: <p>instalação do projeto novo</p> },
    ],
    { initialEntries: ['/projects'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const campo = () => screen.getByRole('textbox', { name: 'Nome do projeto' })

describe('CreateProjectDialog', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.criar.mockReset()
    useProjectsStore.setState({ projects: [projeto('p-1', 'Loja Online')], status: 'ready' })
  })

  it('diz antes do botão para onde a pessoa vai', () => {
    montar()

    expect(
      screen.getByText(
        'Ao criar, você vai para a instalação: copiar a chave pública e colar o script no site.',
      ),
    ).toBeTruthy()
  })

  it('criar leva à Instalação do projeto novo, e não às chaves', async () => {
    dublê.criar.mockResolvedValue(criado('p-9', 'Loja Mobile'))
    const router = montar()

    fireEvent.change(campo(), { target: { value: '  Loja Mobile ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-9/start'))
    expect(dublê.criar).toHaveBeenCalledWith('Loja Mobile')
  })

  it('nome repetido na própria conta é recusado na hora, sem ir à API', () => {
    montar()

    fireEvent.change(campo(), { target: { value: 'loja online' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))

    expect(screen.getByText(/Você já tem um projeto com esse nome/)).toBeTruthy()
    expect(dublê.criar).not.toHaveBeenCalled()
  })

  it('a recusa da API aparece no campo, acentuada', async () => {
    const { PanelError } = await import('@/data')
    dublê.criar.mockRejectedValue(
      new PanelError('Ja existe um projeto com este nome na conta.', 409),
    )
    const router = montar()

    fireEvent.change(campo(), { target: { value: 'Loja Física' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))

    expect(await screen.findByText('Já existe um projeto com este nome na conta.')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/projects')
  })
})
