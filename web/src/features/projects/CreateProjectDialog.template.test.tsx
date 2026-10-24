// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCreatedViewModel, ProjectTemplate, ProjectViewModel } from '@/contracts'
import { CreateProjectDialog } from '@/features/projects/CreateProjectDialog'
import { useProjectsStore } from '@/features/projects/projectsStore'

/**
 * O QUE ESTES TESTES TRAVAM: a escolha do modelo ao criar o projeto.
 *
 * - **Quatro modelos, na ordem da escolha**, cada um com as colunas escritas — e o
 *   que a pessoa reconhece do jeito de trabalhar do time.
 * - **O quadro simples vem marcado**: quem so digita o nome e confirma recebe o
 *   projeto de sempre.
 * - **O modelo escolhido vai no pedido de criar**, junto com o nome, e fechar o
 *   dialogo devolve a escolha ao padrao.
 */
const dublê = vi.hoisted(() => ({
  criar: vi.fn<(nome: string, modelo?: ProjectTemplate) => Promise<ProjectCreatedViewModel>>(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectService: {
      ...real.projectService,
      createProject: (nome: string, modelo?: ProjectTemplate) => dublê.criar(nome, modelo),
    },
  }
})

function projeto(publicId: string, name: string): ProjectViewModel {
  return {
    PublicId: publicId,
    Name: name,
    Status: 'Active',
    CreatedAt: '2026-10-08T12:00:00.000Z',
    UpdatedAt: '2026-10-08T12:00:00.000Z',
    Account: { PublicId: 'c-1', Name: 'Conta da Ana' },
    Role: 'Administrator',
    IsAccountOwner: true,
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

/** Monta o dialogo com o `open` controlado, como a tela que o abre faz. */
function montar() {
  function Casca() {
    const [aberto, setAberto] = useState(true)
    return (
      <>
        <button type="button" onClick={() => setAberto(true)}>
          abrir de novo
        </button>
        <CreateProjectDialog open={aberto} onOpenChange={setAberto} />
      </>
    )
  }

  const router = createMemoryRouter(
    [
      { path: '/projects', element: <Casca /> },
      { path: '/projects/:publicId/start', element: <p>instalação do projeto novo</p> },
    ],
    { initialEntries: ['/projects'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const grupoDeModelos = () => within(screen.getByRole('group', { name: 'Como o time trabalha' }))
const modelo = (nome: string) =>
  grupoDeModelos().getByRole('radio', { name: nome }) as HTMLInputElement
const campo = () => screen.getByRole('textbox', { name: 'Nome do projeto' })

describe('CreateProjectDialog: o modelo do projeto', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.criar.mockReset()
    useProjectsStore.setState({ projects: [projeto('p-1', 'Loja Online')], status: 'ready' })
  })

  it('oferece os quatro modelos, na ordem, cada um com as colunas escritas', () => {
    montar()

    const opcoes = grupoDeModelos().getAllByRole('radio')
    expect(opcoes.map((opcao) => (opcao as HTMLInputElement).value)).toEqual([
      'SimpleBoard',
      'Support',
      'Kanban',
      'Scrum',
    ])

    expect(modelo('Quadro simples').getAttribute('aria-describedby')).toBeTruthy()
    const colunas = (nome: string) => {
      const detalhe = document.getElementById(modelo(nome).getAttribute('aria-describedby') ?? '')
      return detalhe?.textContent ?? ''
    }
    expect(colunas('Quadro simples')).toContain('Colunas: A fazer · Fazendo · Feito')
    expect(colunas('Suporte')).toContain(
      'Colunas: Novo · Em atendimento · Aguardando quem relatou · Resolvido',
    )
    expect(colunas('Kanban')).toContain('Colunas: Backlog · A fazer · Fazendo · Em revisão · Feito')
    expect(colunas('Scrum')).toContain('Colunas: A fazer · Fazendo · Em revisão · Feito')
    expect(screen.getByText('Tudo se ajusta depois.')).toBeTruthy()
  })

  it('o quadro simples vem marcado, e só ele', () => {
    montar()

    expect(modelo('Quadro simples').checked).toBe(true)
    expect(grupoDeModelos().getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('quem só digita o nome e confirma cria com o quadro simples', async () => {
    dublê.criar.mockResolvedValue(criado('p-9', 'Loja Mobile'))
    const router = montar()

    fireEvent.change(campo(), { target: { value: 'Loja Mobile' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-9/start'))
    expect(dublê.criar).toHaveBeenCalledWith('Loja Mobile', 'SimpleBoard')
  })

  it.each([
    ['Suporte', 'Support'],
    ['Kanban', 'Kanban'],
    ['Scrum', 'Scrum'],
  ] as const)('escolher %s manda %s no pedido de criar', async (nome, valor) => {
    dublê.criar.mockResolvedValue(criado('p-9', 'Atendimento'))
    const router = montar()

    fireEvent.click(modelo(nome))
    expect(modelo(nome).checked).toBe(true)
    expect(modelo('Quadro simples').checked).toBe(false)

    fireEvent.change(campo(), { target: { value: 'Atendimento' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-9/start'))
    expect(dublê.criar).toHaveBeenCalledTimes(1)
    expect(dublê.criar).toHaveBeenCalledWith('Atendimento', valor)
  })

  it('nome recusado na hora não perde o modelo escolhido', () => {
    montar()

    fireEvent.click(modelo('Kanban'))
    fireEvent.change(campo(), { target: { value: 'loja online' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))

    expect(dublê.criar).not.toHaveBeenCalled()
    expect(modelo('Kanban').checked).toBe(true)
  })

  it('fechar pelo Esc e abrir de novo volta ao quadro simples', async () => {
    montar()

    fireEvent.click(modelo('Scrum'))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'abrir de novo' }))
    expect(modelo('Quadro simples').checked).toBe(true)
    expect(modelo('Scrum').checked).toBe(false)
  })

  it('cancelar e abrir de novo também volta ao quadro simples, com o nome em branco', async () => {
    montar()

    fireEvent.click(modelo('Suporte'))
    fireEvent.change(campo(), { target: { value: 'Atendimento' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'abrir de novo' }))
    expect(modelo('Quadro simples').checked).toBe(true)
    expect((campo() as HTMLInputElement).value).toBe('')
  })
})
