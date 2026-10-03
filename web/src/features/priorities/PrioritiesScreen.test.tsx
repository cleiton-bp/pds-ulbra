// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectPriorityViewModel, ProjectViewModel } from '@/contracts'
import { PrioritiesScreen } from '@/features/priorities/PrioritiesScreen'

/**
 * O QUE ESTES TESTES TRAVAM: a tela de Prioridades.
 *
 * - **A lista vem da menos para a mais urgente**, com as aposentadas no lugar delas.
 * - **Reordenar e otimista**: a seta move na hora e grava a lista inteira; a recusa
 *   devolve a ordem de antes.
 * - **Nome e cor se gravam juntos**, e criar pede os dois.
 * - **Aposentar pede confirmacao**: a prioridade fica nos cards que ja a tem.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<() => Promise<ProjectPriorityViewModel[]>>(),
  criar: vi.fn(),
  mudar: vi.fn(),
  reordenar: vi.fn(),
  aposentar: vi.fn(),
  reativar: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectPriorityService: {
      listPriorities: dublê.listar,
      addPriority: dublê.criar,
      updatePriority: dublê.mudar,
      reorderPriorities: dublê.reordenar,
      deactivatePriority: dublê.aposentar,
      activatePriority: dublê.reativar,
    },
  }
})

function prioridade(
  publicId: string,
  name: string,
  position: number,
  extra: Partial<ProjectPriorityViewModel> = {},
): ProjectPriorityViewModel {
  return {
    PublicId: publicId,
    Name: name,
    Color: 'Blue',
    Position: position,
    IsActive: true,
    CreatedAt: '2026-10-01T12:00:00.000Z',
    ...extra,
  }
}

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: '2026-08-01T12:00:00.000Z',
  UpdatedAt: '2026-08-01T12:00:00.000Z',
  Account: { PublicId: 'conta-1', Name: 'Conta de teste' },
  Role: 'Administrator',
  IsAccountOwner: true,
}

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ project: projeto }} />,
        children: [{ index: true, element: <PrioritiesScreen /> }],
      },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

const nomesNaTela = () =>
  screen
    .getAllByRole('listitem')
    .map((linha) => linha.querySelector('.rounded-full')?.textContent ?? '')

const fabrica = () => [
  prioridade('p-baixa', 'Baixa', 0),
  prioridade('p-media', 'Média', 1, { Color: 'Yellow' }),
  prioridade('p-alta', 'Alta', 2, { Color: 'Orange' }),
  prioridade('p-urgente', 'Urgente', 3, { Color: 'Red' }),
]

describe('a tela de Prioridades', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.listar.mockResolvedValue(fabrica())
  })

  it('mostra a lista da menos para a mais urgente, e a aposentada marcada', async () => {
    dublê.listar.mockResolvedValue([
      ...fabrica().slice(0, 3),
      prioridade('p-urgente', 'Urgente', 3, { IsActive: false }),
    ])
    montar()

    await screen.findByText('Baixa')
    expect(nomesNaTela()).toEqual(['Baixa', 'Média', 'Alta', 'Urgente'])
    expect(screen.getByText('Aposentada')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reativar Urgente' })).toBeTruthy()
  })

  it('a seta move na hora e grava a lista inteira; a recusa devolve a ordem', async () => {
    let devolver: (lista: ProjectPriorityViewModel[]) => void = () => undefined
    dublê.reordenar.mockReturnValueOnce(
      new Promise((resolver) => {
        devolver = resolver
      }),
    )
    montar()
    await screen.findByText('Baixa')

    fireEvent.click(screen.getByRole('button', { name: 'Mover Alta para cima' }))
    // Antes da resposta: a tela ja mostra a ordem nova.
    expect(nomesNaTela()).toEqual(['Baixa', 'Alta', 'Média', 'Urgente'])
    expect(dublê.reordenar).toHaveBeenCalledWith('p-1', {
      Order: ['p-baixa', 'p-alta', 'p-media', 'p-urgente'],
    })
    devolver(fabrica())
    await waitFor(() => expect(nomesNaTela()).toEqual(['Baixa', 'Média', 'Alta', 'Urgente']))

    dublê.reordenar.mockRejectedValueOnce(new Error('recusado'))
    fireEvent.click(screen.getByRole('button', { name: 'Mover Urgente para cima' }))
    await waitFor(() => expect(nomesNaTela()).toEqual(['Baixa', 'Média', 'Alta', 'Urgente']))
  })

  it('criar manda o nome e a cor escolhida, e a nova entra no fim', async () => {
    dublê.criar.mockResolvedValue(prioridade('p-bloq', 'Bloqueante', 4, { Color: 'Red' }))
    montar()
    await screen.findByText('Baixa')

    fireEvent.change(screen.getByRole('textbox', { name: 'Nova prioridade' }), {
      target: { value: '  Bloqueante ' },
    })
    const novaCor = screen.getAllByRole('group', { name: 'Cor' }).at(-1) as HTMLElement
    fireEvent.click(within(novaCor).getByRole('button', { name: 'Vermelho' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar prioridade' }))

    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith('p-1', { Name: 'Bloqueante', Color: 'Red' }),
    )
    await waitFor(() => expect(nomesNaTela().at(-1)).toBe('Bloqueante'))
  })

  it('editar grava nome e cor juntos', async () => {
    dublê.mudar.mockResolvedValue(prioridade('p-alta', 'Importante', 2, { Color: 'Purple' }))
    montar()
    await screen.findByText('Alta')

    fireEvent.click(screen.getByRole('button', { name: 'Editar Alta' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Importante' },
    })
    const cores = screen.getAllByRole('group', { name: 'Cor' })[0] as HTMLElement
    fireEvent.click(within(cores).getByRole('button', { name: 'Roxo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(dublê.mudar).toHaveBeenCalledWith('p-1', 'p-alta', {
        Name: 'Importante',
        Color: 'Purple',
      }),
    )
    expect(await screen.findByText('Importante')).toBeTruthy()
  })

  it('aposentar pede confirmacao, e so entao grava', async () => {
    dublê.aposentar.mockResolvedValue(prioridade('p-alta', 'Alta', 2, { IsActive: false }))
    montar()
    await screen.findByText('Alta')

    fireEvent.click(screen.getByRole('button', { name: 'Aposentar Alta' }))
    expect(dublê.aposentar).not.toHaveBeenCalled()
    const dialogo = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aposentar' }))

    await waitFor(() => expect(dublê.aposentar).toHaveBeenCalledWith('p-1', 'p-alta'))
    expect(await screen.findByRole('button', { name: 'Reativar Alta' })).toBeTruthy()
  })
})
