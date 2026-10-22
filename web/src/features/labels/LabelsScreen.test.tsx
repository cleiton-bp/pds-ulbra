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
 * - **Daqui tambem se cria**, numa linha: nome, o botao da cor (a paleta so abre quando
 *   se pede) e Criar. Nome repetido devolve a que ja existe — a tela diz "já existia" e
 *   marca a linha dela, sem linha dobrada.
 * - **A previa e o card**: ate tres etiquetas e "+N", com a aberta primeiro, como esta
 *   escrita agora.
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

/** A lista da esquerda: a previa tambem desenha as etiquetas, e nao conta. */
const lista = () => screen.getByRole('list', { name: 'Etiquetas do projeto' })

/** A previa da direita, com o card de exemplo. */
const previa = () => screen.getByRole('region', { name: 'Como aparece no card' })

/** Abre a paleta da nova etiqueta e escolhe `cor`. */
function escolherCor(cor: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Cor da nova etiqueta/ }))
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Cor' })).getByRole('button', { name: cor }),
  )
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

    await screen.findByRole('button', { name: 'Editar pagamento' })
    expect(within(lista()).getByText('pagamento')).toBeTruthy()
    expect(screen.getByText('3 cards')).toBeTruthy()
    expect(screen.getByText('1 card')).toBeTruthy()
    expect(screen.getByText('em nenhum card')).toBeTruthy()
  })

  it('apagar diz de quantos cards ela sai, e so entao apaga', async () => {
    dublê.apagar.mockResolvedValue(undefined)
    montar()
    await screen.findByRole('button', { name: 'Apagar pagamento' })

    fireEvent.click(screen.getByRole('button', { name: 'Apagar pagamento' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText(/Ela sai de 3 cards/)).toBeTruthy()
    expect(dublê.apagar).not.toHaveBeenCalled()

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(dublê.apagar).toHaveBeenCalledWith('p-1', 'l-pag'))
    await waitFor(() => expect(within(lista()).queryByText('pagamento')).toBeNull())
  })

  it('renomear grava nome e cor, e a lista continua em ordem de nome', async () => {
    dublê.mudar.mockResolvedValue(etiqueta('l-pag', 'abacaxi', 3, { Color: 'Pink' }))
    montar()
    await screen.findByRole('button', { name: 'Editar pagamento' })
    // A paleta de criar fica fechada: o unico grupo "Cor" e o da linha aberta.
    expect(screen.queryByRole('group', { name: 'Cor' })).toBeNull()

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
    await screen.findByRole('button', { name: 'Editar abacaxi' })
    const nomes = within(lista())
      .getAllByRole('listitem')
      .map((linha) => linha.textContent ?? '')
    expect(nomes[0]).toContain('abacaxi')
  })

  it('criar manda o nome e a cor, e a nova entra na ordem de nome', async () => {
    dublê.criar.mockResolvedValue(etiqueta('l-ace', 'acesso', 0, { Color: 'Red' }))
    montar()
    await screen.findByRole('button', { name: 'Editar pagamento' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Nova etiqueta' }), {
      target: { value: '  acesso ' },
    })
    escolherCor('Vermelho')
    // Escolher fecha a paleta, e o botao passa a dizer a cor.
    expect(screen.queryByRole('group', { name: 'Cor' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cor da nova etiqueta: Vermelho' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Criar etiqueta' }))

    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith('p-1', { Name: 'acesso', Color: 'Red' }),
    )
    await screen.findByRole('button', { name: 'Editar acesso' })
    const linhas = within(lista()).getAllByRole('listitem')
    expect(linhas[0]?.textContent).toContain('acesso')
    // A nova fica marcada: em ordem de nome, ela pode entrar longe do campo.
    expect(linhas[0]?.hasAttribute('data-marcada')).toBe(true)
    expect(screen.queryByText(/já existia/)).toBeNull()
    // O campo esvazia para a proxima.
    expect((screen.getByRole('textbox', { name: 'Nova etiqueta' }) as HTMLInputElement).value).toBe(
      '',
    )
  })

  it('nome repetido diz que já existia e marca a que estava, sem linha dobrada', async () => {
    dublê.criar.mockResolvedValue(etiqueta('l-pag', 'pagamento', 3))
    montar()
    await screen.findByRole('button', { name: 'Editar pagamento' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Nova etiqueta' }), {
      target: { value: 'Pagamento' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar etiqueta' }))

    await waitFor(() => expect(dublê.criar).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringMatching(/“pagamento” já existia/),
    )
    const linhas = within(lista()).getAllByRole('listitem')
    expect(linhas).toHaveLength(3)
    expect(within(lista()).getAllByText('pagamento')).toHaveLength(1)
    const marcadas = linhas.filter((linha) => linha.hasAttribute('data-marcada'))
    expect(marcadas).toHaveLength(1)
    expect(marcadas[0]?.textContent).toContain('pagamento')

    // Escrever de novo tira a marca e o aviso.
    fireEvent.change(screen.getByRole('textbox', { name: 'Nova etiqueta' }), {
      target: { value: 'x' },
    })
    expect(screen.queryByText(/já existia/)).toBeNull()
  })

  it('a prévia mostra até 3 etiquetas e "+N", com a aberta primeiro como está escrita', async () => {
    dublê.listar.mockResolvedValue([
      etiqueta('l-cel', 'celular', 1, { Color: 'Green' }),
      etiqueta('l-pag', 'pagamento', 3),
      etiqueta('l-ui', 'tela', 0, { Color: 'Purple' }),
      etiqueta('l-ux', 'uso', 2, { Color: 'Pink' }),
    ])
    montar()
    await screen.findByRole('button', { name: 'Editar uso' })

    expect(within(previa()).getByText(/O card mostra só 3 etiquetas/)).toBeTruthy()
    expect(within(previa()).getByText('+1')).toBeTruthy()
    expect(within(previa()).queryByText('uso')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Editar uso' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'usabilidade' },
    })

    // A aberta vem primeiro, com o nome do rascunho, e quem sobra vira "+1".
    expect(within(previa()).getByText('usabilidade')).toBeTruthy()
    expect(within(previa()).getByText('+1')).toBeTruthy()
    expect(within(previa()).getByText('ainda não salvo')).toBeTruthy()
    expect(dublê.mudar).not.toHaveBeenCalled()
  })

  it('a recusa ao criar fica no campo, com o texto acentuado', async () => {
    const { PanelError } = await import('@/data')
    dublê.criar.mockRejectedValue(new PanelError('O nome da etiqueta e obrigatorio.', 400))
    montar()
    await screen.findByRole('button', { name: 'Editar pagamento' })

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
