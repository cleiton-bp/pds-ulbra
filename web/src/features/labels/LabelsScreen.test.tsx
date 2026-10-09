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
 * - **Daqui tambem se cria**, com nome e cor: sem isso nao dava para preparar o
 *   projeto antes de o time comecar. Nome repetido devolve a que ja existe, e a
 *   lista nao ganha uma linha dobrada.
 * - **Sem etiqueta nenhuma, a tela diz de onde elas vem**: do time, ao etiquetar.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<() => Promise<ProjectLabelViewModel[]>>(),
  criar: vi.fn(),
  mudar: vi.fn(),
  apagar: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectLabelService: {
      listLabels: dublê.listar,
      addLabel: dublê.criar,
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
  LastReportReceivedAt: null,
  LastActivityAt: null,
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
    // Dois grupos "Cor" na tela: o da linha em edicao, primeiro, e o de criar, no fim.
    const corDaLinha = screen.getAllByRole('group', { name: 'Cor' })[0] as HTMLElement
    fireEvent.click(within(corDaLinha).getByRole('button', { name: 'Rosa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(dublê.mudar).toHaveBeenCalledWith('p-1', 'l-pag', { Name: 'abacaxi', Color: 'Pink' }),
    )
    await screen.findByText('abacaxi')
    const nomes = screen.getAllByRole('listitem').map((linha) => linha.textContent ?? '')
    expect(nomes[0]).toContain('abacaxi')
  })

  it('criar manda o nome e a cor, e a nova entra na ordem de nome', async () => {
    dublê.criar.mockResolvedValue(etiqueta('l-ace', 'acesso', 0, { Color: 'Red' }))
    montar()
    await screen.findByText('pagamento')

    fireEvent.change(screen.getByRole('textbox', { name: 'Nova etiqueta' }), {
      target: { value: '  acesso ' },
    })
    const corNova = screen.getAllByRole('group', { name: 'Cor' }).at(-1) as HTMLElement
    fireEvent.click(within(corNova).getByRole('button', { name: 'Vermelho' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar etiqueta' }))

    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith('p-1', { Name: 'acesso', Color: 'Red' }),
    )
    await screen.findByText('acesso')
    const nomes = screen.getAllByRole('listitem').map((linha) => linha.textContent ?? '')
    expect(nomes[0]).toContain('acesso')
    // O campo esvazia para a proxima.
    expect((screen.getByRole('textbox', { name: 'Nova etiqueta' }) as HTMLInputElement).value).toBe(
      '',
    )
  })

  it('nome repetido devolve a que já existe, e a lista não ganha linha dobrada', async () => {
    dublê.criar.mockResolvedValue(etiqueta('l-pag', 'pagamento', 3))
    montar()
    await screen.findByText('pagamento')

    fireEvent.change(screen.getByRole('textbox', { name: 'Nova etiqueta' }), {
      target: { value: 'Pagamento' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar etiqueta' }))

    await waitFor(() => expect(dublê.criar).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'Nova etiqueta' }) as HTMLInputElement).value,
      ).toBe(''),
    )
    expect(screen.getAllByText('pagamento')).toHaveLength(1)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('a recusa ao criar fica no campo, com o texto acentuado', async () => {
    const { PanelError } = await import('@/data')
    dublê.criar.mockRejectedValue(new PanelError('O nome da etiqueta e obrigatorio.', 400))
    montar()
    await screen.findByText('pagamento')

    fireEvent.change(screen.getByRole('textbox', { name: 'Nova etiqueta' }), {
      target: { value: 'x' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar etiqueta' }))

    expect(await screen.findByText('O nome da etiqueta é obrigatório.')).toBeTruthy()
  })

  it('sem etiqueta nenhuma, a tela diz que elas nascem no card', async () => {
    dublê.listar.mockResolvedValue([])
    montar()

    expect(await screen.findByText(/aparecem aqui assim que alguém do time etiquetar/)).toBeTruthy()
  })
})
