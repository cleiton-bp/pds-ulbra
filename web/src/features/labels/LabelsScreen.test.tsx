// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectLabelViewModel, ProjectViewModel } from '@/contracts'
import { LabelsScreen } from '@/features/labels/LabelsScreen'

/**
 * O QUE ESTES TESTES TRAVAM: a tela de Etiquetas, onde o administrador organiza.
 *
 * - **A tela diz em quantos cards cada etiqueta esta** — e e isso que o dialogo de
 *   apagar repete, antes de apagar.
 * - **Renomear grava nome e cor juntos**, e a lista continua em ordem de nome.
 * - **Sem etiqueta nenhuma, a tela diz de onde elas vem**: do time, ao etiquetar.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<() => Promise<ProjectLabelViewModel[]>>(),
  mudar: vi.fn(),
  apagar: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectLabelService: {
      listLabels: dublê.listar,
      addLabel: vi.fn(),
      updateLabel: dublê.mudar,
      deleteLabel: dublê.apagar,
    },
  }
})

function etiqueta(
  publicId: string,
  name: string,
  cardCount: number,
  extra: Partial<ProjectLabelViewModel> = {},
): ProjectLabelViewModel {
  return {
    PublicId: publicId,
    Name: name,
    Color: 'Blue',
    CardCount: cardCount,
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
        children: [{ index: true, element: <LabelsScreen /> }],
      },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

describe('a tela de Etiquetas', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.listar.mockResolvedValue([
      etiqueta('l-cel', 'celular', 1, { Color: 'Green' }),
      etiqueta('l-pag', 'pagamento', 3),
      etiqueta('l-ui', 'tela', 0, { Color: 'Purple' }),
    ])
  })

  it('cada etiqueta vem com em quantos cards esta', async () => {
    montar()

    expect(await screen.findByText('pagamento')).toBeTruthy()
    expect(screen.getByText('3 cards')).toBeTruthy()
    expect(screen.getByText('1 card')).toBeTruthy()
    expect(screen.getByText('em nenhum card')).toBeTruthy()
  })

  it('apagar diz de quantos cards ela sai, e so entao apaga', async () => {
    dublê.apagar.mockResolvedValue(undefined)
    montar()
    await screen.findByText('pagamento')

    fireEvent.click(screen.getByRole('button', { name: 'Apagar pagamento' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText(/Ela sai de 3 cards/)).toBeTruthy()
    expect(dublê.apagar).not.toHaveBeenCalled()

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(dublê.apagar).toHaveBeenCalledWith('p-1', 'l-pag'))
    await waitFor(() => expect(screen.queryByText('pagamento')).toBeNull())
  })

  it('renomear grava nome e cor, e a lista continua em ordem de nome', async () => {
    dublê.mudar.mockResolvedValue(etiqueta('l-pag', 'abacaxi', 3, { Color: 'Pink' }))
    montar()
    await screen.findByText('pagamento')

    fireEvent.click(screen.getByRole('button', { name: 'Editar pagamento' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'abacaxi' },
    })
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Cor' })).getByRole('button', { name: 'Rosa' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(dublê.mudar).toHaveBeenCalledWith('p-1', 'l-pag', { Name: 'abacaxi', Color: 'Pink' }),
    )
    await screen.findByText('abacaxi')
    const nomes = screen.getAllByRole('listitem').map((linha) => linha.textContent ?? '')
    expect(nomes[0]).toContain('abacaxi')
  })

  it('sem etiqueta nenhuma, a tela diz que elas nascem no card', async () => {
    dublê.listar.mockResolvedValue([])
    montar()

    expect(await screen.findByText(/aparecem aqui assim que alguém do time etiquetar/)).toBeTruthy()
  })
})
