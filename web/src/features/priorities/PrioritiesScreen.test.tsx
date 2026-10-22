// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectPriorityViewModel, ProjectViewModel } from '@/contracts'
import { PrioritiesScreen } from '@/features/priorities/PrioritiesScreen'

/**
 * O QUE ESTES TESTES TRAVAM: a tela de Prioridades.
 *
 * - **A lista vem da menos para a mais urgente**, com as desativadas no lugar delas.
 * - **Reordenar e otimista**: a seta move na hora e grava a lista inteira; a recusa
 *   devolve a ordem de antes.
 * - **Nome e cor se gravam juntos**, e criar pede os dois.
 * - **Desativar pede confirmacao**: a prioridade fica nos cards que ja a tem. O verbo
 *   e o mesmo das Colunas ("Desativar"/"Reativar", selo "Desativada") — antes cada
 *   lista tinha o seu.
 * - **A regua diz o sentido da ordem**, e arrastar pela alca grava como as setas.
 * - **A previa e a do card**: o desenho real da prioridade aberta, como esta escrita
 *   agora, e a lista de escolha sem as desativadas.
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
  LastReportReceivedAt: null,
  LastActivityAt: null,
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

/** A lista da esquerda: a previa tambem desenha as prioridades, e nao conta. */
const lista = () => screen.getByRole('list', { name: 'Prioridades, da menos para a mais urgente' })

/** A previa da direita, com o card de exemplo e a lista de escolha. */
const previa = () => screen.getByRole('region', { name: 'Como aparece no card' })

/** O nome de cada linha, pelo desenho da prioridade no cabecalho dela. */
const nomesNaTela = () =>
  within(lista())
    .getAllByRole('listitem')
    .map(
      (linha) =>
        linha
          .querySelector('summary [title^="Prioridade "]')
          ?.getAttribute('title')
          ?.replace('Prioridade ', '') ?? '',
    )

const linhaDe = (nome: string) =>
  within(lista())
    .getAllByRole('listitem')
    .find((linha) => linha.querySelector(`summary [title="Prioridade ${nome}"]`)) as HTMLElement

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

  it('mostra a lista da menos para a mais urgente, e a desativada marcada', async () => {
    dublê.listar.mockResolvedValue([
      ...fabrica().slice(0, 3),
      prioridade('p-urgente', 'Urgente', 3, { IsActive: false }),
    ])
    montar()

    await screen.findByRole('button', { name: 'Editar Baixa' })
    expect(nomesNaTela()).toEqual(['Baixa', 'Média', 'Alta', 'Urgente'])
    expect(within(lista()).getByText('Desativada')).toBeTruthy()
    expect(screen.queryByText('Aposentada')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reativar Urgente' })).toBeTruthy()
    // A regua ao lado da lista diz para que lado a urgencia cresce.
    expect(screen.getByText('menos urgente')).toBeTruthy()
    expect(screen.getByText('mais urgente')).toBeTruthy()
    // A lista de escolha do card, na ordem, sem a desativada.
    const escolha = within(previa()).getByRole('list', { name: 'A lista de escolha no card' })
    expect(
      within(escolha)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Sem prioridade', 'Prioridade Baixa', 'Prioridade Média', 'Prioridade Alta'])
  })

  it('a seta move na hora e grava a lista inteira; a recusa devolve a ordem', async () => {
    let devolver: (lista: ProjectPriorityViewModel[]) => void = () => undefined
    dublê.reordenar.mockReturnValueOnce(
      new Promise((resolver) => {
        devolver = resolver
      }),
    )
    montar()
    await screen.findByRole('button', { name: 'Editar Baixa' })

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

  it('arrastar pela alça grava a lista inteira, com a desativada no lugar dela', async () => {
    const lista0 = [
      ...fabrica().slice(0, 3),
      prioridade('p-urgente', 'Urgente', 3, { IsActive: false }),
    ]
    dublê.listar.mockResolvedValue(lista0)
    dublê.reordenar.mockImplementation(async (_projeto: string, { Order }: { Order: string[] }) =>
      Order.map((id) => lista0.find((item) => item.PublicId === id)),
    )
    montar()
    await screen.findByRole('button', { name: 'Editar Baixa' })

    const alta = linhaDe('Alta')
    fireEvent.mouseDown(alta.querySelector('button[tabindex="-1"]') as HTMLElement)
    fireEvent.dragStart(alta, { dataTransfer: { setData: () => undefined } })
    fireEvent.dragEnter(linhaDe('Baixa'))
    // Arrastando: a lista ja mostra o lugar novo, e nada foi gravado ainda.
    expect(nomesNaTela()).toEqual(['Alta', 'Baixa', 'Média', 'Urgente'])
    expect(dublê.reordenar).not.toHaveBeenCalled()

    fireEvent.drop(linhaDe('Alta'))
    await waitFor(() =>
      expect(dublê.reordenar).toHaveBeenCalledWith('p-1', {
        Order: ['p-alta', 'p-baixa', 'p-media', 'p-urgente'],
      }),
    )
    await waitFor(() => expect(nomesNaTela()).toEqual(['Alta', 'Baixa', 'Média', 'Urgente']))
  })

  it('a paleta só aparece na nova; criar manda o nome e a cor, e a nova entra no fim', async () => {
    dublê.criar.mockResolvedValue(prioridade('p-bloq', 'Bloqueante', 4, { Color: 'Red' }))
    montar()
    await screen.findByRole('button', { name: 'Editar Baixa' })
    expect(screen.queryByRole('group', { name: 'Cor' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Nova prioridade' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: '  Bloqueante ' },
    })
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Cor' })).getByRole('button', { name: 'Vermelho' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Criar prioridade' }))

    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith('p-1', { Name: 'Bloqueante', Color: 'Red' }),
    )
    await waitFor(() => expect(nomesNaTela().at(-1)).toBe('Bloqueante'))
    expect(screen.getByRole('button', { name: 'Nova prioridade' })).toBeTruthy()
  })

  it('editar grava nome e cor juntos', async () => {
    dublê.mudar.mockResolvedValue(prioridade('p-alta', 'Importante', 2, { Color: 'Purple' }))
    montar()
    await screen.findByRole('button', { name: 'Editar Alta' })

    fireEvent.click(screen.getByRole('button', { name: 'Editar Alta' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Importante' },
    })
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Cor' })).getByRole('button', { name: 'Roxo' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(dublê.mudar).toHaveBeenCalledWith('p-1', 'p-alta', {
        Name: 'Importante',
        Color: 'Purple',
      }),
    )
    await waitFor(() => expect(nomesNaTela()).toEqual(['Baixa', 'Média', 'Importante', 'Urgente']))
  })

  it('a prévia mostra no card a prioridade aberta como está escrita agora', async () => {
    montar()
    await screen.findByRole('button', { name: 'Editar Alta' })
    const noCard = () =>
      within(previa())
        .getAllByTitle(/^Prioridade /)
        .at(0)
        ?.getAttribute('title')
    // Nada aberto: o card mostra a primeira da lista.
    expect(noCard()).toBe('Prioridade Baixa')

    fireEvent.click(screen.getByRole('button', { name: 'Editar Alta' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Importante' },
    })

    expect(noCard()).toBe('Prioridade Importante')
    expect(within(previa()).getByText('ainda não salvo')).toBeTruthy()
    expect(dublê.mudar).not.toHaveBeenCalled()
  })

  it('com mudança, abrir outra pergunta antes de descartar', async () => {
    montar()
    await screen.findByRole('button', { name: 'Editar Alta' })

    fireEvent.click(screen.getByRole('button', { name: 'Editar Alta' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Importante' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Editar Baixa' }))

    const dialogo = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar editando' }))
    expect((screen.getByRole('textbox', { name: 'Nome' }) as HTMLInputElement).value).toBe(
      'Importante',
    )
  })

  it('desativar pede confirmacao, e so entao grava', async () => {
    dublê.aposentar.mockResolvedValue(prioridade('p-alta', 'Alta', 2, { IsActive: false }))
    montar()
    await screen.findByRole('button', { name: 'Desativar Alta' })

    fireEvent.click(screen.getByRole('button', { name: 'Desativar Alta' }))
    expect(dublê.aposentar).not.toHaveBeenCalled()
    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText(/continua nos cards que já a têm/)).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desativar' }))

    await waitFor(() => expect(dublê.aposentar).toHaveBeenCalledWith('p-1', 'p-alta'))
    expect(await screen.findByRole('button', { name: 'Reativar Alta' })).toBeTruthy()
  })
})
