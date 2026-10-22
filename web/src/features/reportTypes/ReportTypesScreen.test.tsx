// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectReportTypeViewModel,
  ProjectStateViewModel,
  ProjectViewModel,
} from '@/contracts'
import { ReportTypesScreen } from '@/features/reportTypes/ReportTypesScreen'
import { useToastStore } from '@/shared/components/toastStore'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: a tela de Tipos de relato.
 *
 * - **Cada tipo e um item de acordeao**: fechado, diz em palavras o que pede e onde
 *   entra ("3 perguntas + caixa · entra em Triagem", "Desativado"); aberto, o editor.
 * - **Criar e editar gravam o tipo inteiro**: nome, cor, desenho, perguntas, a caixa
 *   livre com o texto dela e a coluna. A pergunta em branco nao vai; a repetida nem
 *   deixa salvar. O tipo novo abre como um item no fim da lista, ja aberto.
 * - **Enter numa pergunta escreve a proxima**, e nao salva o tipo.
 * - **Trocar de tipo, ou fechar o aberto, com mudanca por salvar pergunta antes**; sair
 *   da tela tambem. Cancelar e desistir de proposito, e nao pergunta.
 * - **O tipo sempre pede alguma coisa**: sem perguntas e sem a caixa, o botao trava e a
 *   tela diz por que. Com a caixa aparecendo, o texto dela e obrigatorio.
 * - **Reordenar pelas setas deixa o foco na seta**, ou na outra quando chega na ponta.
 * - **O ultimo ativo nao se desativa**: em vez do botao, a razao escrita.
 * - **No maximo dez ativos**: com dez, criar some e a tela explica; reativar a API
 *   recusa, e a recusa vira aviso sem mexer na lista.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<() => Promise<ProjectReportTypeViewModel[]>>(),
  criar: vi.fn(),
  mudar: vi.fn(),
  reordenar: vi.fn(),
  desativar: vi.fn(),
  reativar: vi.fn(),
  colunas: vi.fn<() => Promise<ProjectStateViewModel[]>>(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectReportTypeService: {
      listReportTypes: dublê.listar,
      addReportType: dublê.criar,
      updateReportType: dublê.mudar,
      reorderReportTypes: dublê.reordenar,
      deactivateReportType: dublê.desativar,
      activateReportType: dublê.reativar,
    },
    projectStateService: {
      ...real.projectStateService,
      listProjectStates: dublê.colunas,
    },
  }
})

// O seletor de coluna e o do Radix, que precisa destes remendos no jsdom.
instalarRemendosDoRadix()

function tipo(
  publicId: string,
  name: string,
  position: number,
  extra: Partial<ProjectReportTypeViewModel> = {},
): ProjectReportTypeViewModel {
  return {
    PublicId: publicId,
    Name: name,
    Color: 'Gray',
    Icon: 'Other',
    Position: position,
    IsActive: true,
    Questions: [],
    ShowsTextBox: true,
    TextBoxPrompt: 'Conte o que aconteceu.',
    InitialStatePublicId: null,
    CreatedAt: '2026-10-01T12:00:00.000Z',
    ...extra,
  }
}

function coluna(publicId: string, name: string, position: number): ProjectStateViewModel {
  return {
    PublicId: publicId,
    Name: name,
    Position: position,
    IsActive: true,
    CreatedAt: '2026-10-01T12:00:00.000Z',
  }
}

const fabrica = () => [
  tipo('t-defeito', 'Defeito', 0, {
    Color: 'Red',
    Icon: 'Bug',
    Questions: ['O que você tentou fazer?', 'O que aconteceu?', 'O que esperava?'],
    TextBoxPrompt: 'Algo mais?',
    InitialStatePublicId: 's-triagem',
  }),
  tipo('t-melhoria', 'Melhoria', 1, { Color: 'Blue', Icon: 'Improvement' }),
  tipo('t-duvida', 'Dúvida', 2, { Color: 'Yellow', Icon: 'Question' }),
]

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
        children: [
          { index: true, element: <ReportTypesScreen /> },
          { path: 'form-texts', element: <p>Tela do Formulário</p> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
const campo = (nome: string | RegExp) => screen.getByRole('textbox', { name: nome })
const escrever = (elemento: HTMLElement, valor: string) =>
  fireEvent.change(elemento, { target: { value: valor } })
const desabilitado = (elemento: HTMLElement) => (elemento as HTMLButtonElement).disabled
const caixaLivre = () =>
  screen.getByRole('checkbox', { name: 'Mostrar a caixa de texto livre' }) as HTMLInputElement
const avisos = () => useToastStore.getState().toasts

/** Os itens da lista, um por tipo — sem as perguntas do editor aberto. */
const itens = () => Array.from(document.querySelectorAll<HTMLElement>('#tipos > ul > li'))

/** O cabecalho (`<summary>`) do tipo, pelo nome que ele mostra. */
const resumo = (nome: string) =>
  screen.getByText(nome, { selector: 'summary span' }).closest('summary') as HTMLElement

/** Clicar no cabecalho: abre o tipo, ou fecha o aberto. */
const abrir = (nome: string) => fireEvent.click(resumo(nome))

describe('a tela de Tipos de relato', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.listar.mockResolvedValue(fabrica())
    dublê.colunas.mockResolvedValue([
      coluna('s-novo', 'Novo', 0),
      coluna('s-triagem', 'Triagem', 1),
    ])
    useToastStore.setState({ toasts: [] })
  })

  it('mostra os tipos na ordem, cada um fechado, com o que pede e onde entra em palavras', async () => {
    montar()

    expect(await screen.findByText('3 perguntas + caixa · entra em Triagem')).toBeTruthy()
    expect(screen.getAllByText('Só a caixa · entra na primeira coluna')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: /Na ordem do formulário/ }).textContent).toContain(
      '(3 de 10)',
    )
    const nomes = itens().map((linha) => linha.textContent ?? '')
    expect(nomes[0]).toContain('Defeito')
    expect(nomes[1]).toContain('Melhoria')
    expect(nomes[2]).toContain('Dúvida')
    // Fechados, sem editor nenhum, e no acordeao da tela.
    expect(screen.queryByRole('textbox', { name: 'Nome' })).toBeNull()
    expect(resumo('Defeito').closest('details')?.getAttribute('name')).toBe('tipos')
  })

  it('o resumo do tipo aberto acompanha o rascunho, e o desativado diz só isso', async () => {
    dublê.listar.mockResolvedValue([
      ...fabrica(),
      tipo('t-velho', 'Antigo', 3, { IsActive: false, Questions: ['Uma?'] }),
    ])
    montar()
    await screen.findByText('Defeito')

    expect(within(resumo('Antigo')).getByText('Desativado')).toBeTruthy()

    abrir('Defeito')
    fireEvent.click(caixaLivre())
    fireEvent.click(botao('Tirar a pergunta 3'))
    expect(resumo('Defeito').textContent).toContain('2 perguntas · entra em Triagem')
    expect(resumo('Defeito').textContent).toContain('não salvo')

    escrever(campo('Nome'), 'Erro')
    expect(resumo('Erro')).toBeTruthy()
  })

  it('criar abre o tipo novo no fim, já aberto, e grava o tipo inteiro sem a pergunta em branco', async () => {
    dublê.criar.mockResolvedValue(
      tipo('t-elogio', 'Elogio', 3, {
        Color: 'Green',
        Icon: 'Praise',
        Questions: ['Do que você gostou?'],
        TextBoxPrompt: 'Conte mais, se quiser.',
      }),
    )
    montar()
    await screen.findByText('Defeito')

    fireEvent.click(botao('Novo tipo de relato'))
    expect(itens()).toHaveLength(4)
    expect(itens().at(-1)?.textContent).toContain('Novo tipo')
    expect(document.activeElement).toBe(campo('Nome'))

    escrever(campo('Nome'), '  Elogio ')
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Cor do card' })).getByRole('button', {
        name: 'Verde',
      }),
    )
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Desenho' })).getByRole('button', {
        name: 'Elogio',
      }),
    )
    fireEvent.click(botao('Adicionar pergunta'))
    escrever(campo('Pergunta 1'), ' Do que você gostou? ')
    // A segunda fica em branco: nao pede nada, e por isso nao vai no pedido.
    fireEvent.click(botao('Adicionar pergunta'))
    expect(screen.getByText('2 de 4')).toBeTruthy()

    // O tipo novo ja vem com a caixa, e a caixa aparecendo exige o texto dela.
    expect(caixaLivre().checked).toBe(true)
    expect(desabilitado(botao('Criar tipo'))).toBe(true)
    escrever(campo('Texto dentro da caixa'), ' Conte mais, se quiser. ')
    expect(desabilitado(botao('Criar tipo'))).toBe(false)

    fireEvent.click(botao('Criar tipo'))

    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith('p-1', {
        Name: 'Elogio',
        Color: 'Green',
        Icon: 'Praise',
        Questions: ['Do que você gostou?'],
        ShowsTextBox: true,
        TextBoxPrompt: 'Conte mais, se quiser.',
        InitialStatePublicId: null,
      }),
    )
    await waitFor(() => expect(itens().at(-1)?.textContent).toContain('Elogio'))
    expect(itens()).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Criar tipo' })).toBeNull()
    expect(avisos().some((aviso) => aviso.message.includes('“Elogio” criado'))).toBe(true)
  })

  it('a recusa da API fica no editor, que continua aberto', async () => {
    const { PanelError } = await import('@/data')
    dublê.criar.mockRejectedValue(
      new PanelError('Ja existe um tipo de relato com este nome no projeto.', 409),
    )
    montar()
    await screen.findByText('Defeito')

    fireEvent.click(botao('Novo tipo de relato'))
    escrever(campo('Nome'), 'Defeito')
    escrever(campo('Texto dentro da caixa'), 'Conte o que aconteceu.')
    fireEvent.click(botao('Criar tipo'))

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toMatch(/existe um tipo de relato com este nome/)
    expect(botao('Criar tipo')).toBeTruthy()
    // Os tres salvos e o novo, ainda aberto.
    expect(itens()).toHaveLength(4)
  })

  it('editar abre com o que o tipo tem e grava o tipo inteiro, mantendo a coluna', async () => {
    dublê.mudar.mockResolvedValue(
      tipo('t-defeito', 'Erro', 0, {
        Color: 'Red',
        Icon: 'Bug',
        Questions: ['O que esperava?', 'O que você tentou fazer?'],
        TextBoxPrompt: 'Algo mais?',
        InitialStatePublicId: 's-triagem',
      }),
    )
    montar()
    await screen.findByText('Defeito')

    abrir('Defeito')
    expect(resumo('Defeito').closest('details')?.open).toBe(true)
    expect((campo('Nome') as HTMLInputElement).value).toBe('Defeito')
    expect((campo('Pergunta 1') as HTMLInputElement).value).toBe('O que você tentou fazer?')
    expect((campo('Pergunta 3') as HTMLInputElement).value).toBe('O que esperava?')
    expect((campo('Texto dentro da caixa') as HTMLInputElement).value).toBe('Algo mais?')
    // Com um tipo aberto, as acoes dos outros continuam ao alcance.
    expect(desabilitado(botao('Desativar Melhoria'))).toBe(false)
    expect(desabilitado(botao('Mover Melhoria para cima'))).toBe(false)
    expect(desabilitado(botao('Novo tipo de relato'))).toBe(false)

    escrever(campo('Nome'), 'Erro')
    fireEvent.click(botao('Tirar a pergunta 2'))
    fireEvent.click(botao('Subir a pergunta 2'))
    fireEvent.click(botao('Salvar'))

    await waitFor(() =>
      expect(dublê.mudar).toHaveBeenCalledWith('p-1', 't-defeito', {
        Name: 'Erro',
        Color: 'Red',
        Icon: 'Bug',
        Questions: ['O que esperava?', 'O que você tentou fazer?'],
        ShowsTextBox: true,
        TextBoxPrompt: 'Algo mais?',
        InitialStatePublicId: 's-triagem',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nome' })).toBeNull())
    expect(resumo('Erro')).toBeTruthy()
    expect(screen.queryByText('Defeito')).toBeNull()
    expect(avisos().map((aviso) => aviso.message)).toContain('Tipo de relato salvo.')
  })

  it('cancelar fecha o tipo sem gravar e sem perguntar', async () => {
    montar()
    await screen.findByText('Defeito')

    abrir('Melhoria')
    escrever(campo('Nome'), 'Sugestão')
    fireEvent.click(botao('Cancelar'))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Nome' })).toBeNull()
    expect(resumo('Melhoria').closest('details')?.open).toBe(false)
    expect(dublê.mudar).not.toHaveBeenCalled()
  })

  describe('a mudança por salvar', () => {
    it('sem mudança, abrir outro tipo troca na hora, um aberto de cada vez', async () => {
      montar()
      await screen.findByText('Defeito')

      abrir('Defeito')
      abrir('Melhoria')

      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect((campo('Nome') as HTMLInputElement).value).toBe('Melhoria')
      expect(resumo('Defeito').closest('details')?.open).toBe(false)
      expect(resumo('Melhoria').closest('details')?.open).toBe(true)
    })

    it('com mudança, abrir outro pergunta antes: continuar mantém o rascunho, descartar troca', async () => {
      montar()
      await screen.findByText('Defeito')

      abrir('Melhoria')
      escrever(campo('Nome'), 'Sugestão')
      abrir('Defeito')

      const dialogo = await screen.findByRole('alertdialog')
      expect(dialogo.textContent).toContain('Descartar o que mudou em “Melhoria”?')
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar editando' }))

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      expect((campo('Nome') as HTMLInputElement).value).toBe('Sugestão')
      expect(resumo('Defeito').closest('details')?.open).toBe(false)

      abrir('Defeito')
      fireEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
      )

      await waitFor(() => expect((campo('Nome') as HTMLInputElement).value).toBe('Defeito'))
      expect(resumo('Melhoria')).toBeTruthy()
      expect(dublê.mudar).not.toHaveBeenCalled()
    })

    it('com mudança, fechar o próprio tipo e criar outro também perguntam', async () => {
      montar()
      await screen.findByText('Defeito')

      abrir('Defeito')
      escrever(campo('Pergunta 1'), 'Em que tela?')

      abrir('Defeito')
      expect(await screen.findByRole('alertdialog')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

      fireEvent.click(botao('Novo tipo de relato'))
      expect(await screen.findByRole('alertdialog')).toBeTruthy()
      expect(itens()).toHaveLength(3)
    })

    it('com mudança, sair da tela pergunta antes', async () => {
      montar()
      await screen.findByText('Defeito')

      abrir('Defeito')
      escrever(campo('Nome'), 'Erro')
      fireEvent.click(screen.getByRole('link', { name: 'Formulário' }))

      const dialogo = await screen.findByRole('alertdialog')
      expect(dialogo.textContent).toContain('Sair sem salvar?')
      expect(screen.queryByText('Tela do Formulário')).toBeNull()
    })
  })

  describe('as perguntas', () => {
    it('Enter numa pergunta escreve a próxima, com o foco nela, e não salva o tipo', async () => {
      montar()
      await screen.findByText('Defeito')

      abrir('Defeito')
      fireEvent.keyDown(campo('Pergunta 3'), { key: 'Enter' })

      await waitFor(() => expect(document.activeElement).toBe(campo('Pergunta 4')))
      expect((campo('Pergunta 4') as HTMLInputElement).value).toBe('')
      expect(dublê.mudar).not.toHaveBeenCalled()
      expect(screen.getByRole('textbox', { name: 'Nome' })).toBeTruthy()

      // Em branco, o Enter nao cria outra em branco; e com quatro, nao passa delas.
      fireEvent.keyDown(campo('Pergunta 4'), { key: 'Enter' })
      expect(screen.queryByRole('textbox', { name: 'Pergunta 5' })).toBeNull()
      expect(dublê.mudar).not.toHaveBeenCalled()
    })

    it('Enter no meio escreve a pergunta logo abaixo da atual', async () => {
      montar()
      await screen.findByText('Defeito')

      abrir('Defeito')
      fireEvent.keyDown(campo('Pergunta 1'), { key: 'Enter' })

      await waitFor(() => expect(document.activeElement).toBe(campo('Pergunta 2')))
      expect((campo('Pergunta 2') as HTMLInputElement).value).toBe('')
      expect((campo('Pergunta 3') as HTMLInputElement).value).toBe('O que aconteceu?')
    })

    it('o contador de cada pergunta só aparece perto do limite', async () => {
      montar()
      await screen.findByText('Defeito')

      abrir('Defeito')
      expect(screen.queryByText(/\/120$/)).toBeNull()

      escrever(campo('Pergunta 1'), 'a'.repeat(99))
      expect(screen.queryByText('99/120')).toBeNull()

      escrever(campo('Pergunta 1'), 'a'.repeat(100))
      expect(screen.getByText('100/120')).toBeTruthy()
      expect(campo('Pergunta 1').getAttribute('aria-describedby')).toBe(
        screen.getByText('100/120').id,
      )
    })

    it('✕ tira a pergunta, e o foco vai para a vizinha', async () => {
      montar()
      await screen.findByText('Defeito')

      abrir('Defeito')
      fireEvent.click(botao('Tirar a pergunta 1'))

      await waitFor(() => expect(document.activeElement).toBe(campo('Pergunta 1')))
      expect((campo('Pergunta 1') as HTMLInputElement).value).toBe('O que aconteceu?')
      expect(screen.getByText('2 de 4')).toBeTruthy()
    })

    it('cabem no máximo quatro: depois disso, adicionar trava e a tela diz por que', async () => {
      montar()
      await screen.findByText('Defeito')

      abrir('Defeito')
      expect(screen.getByText('3 de 4')).toBeTruthy()
      fireEvent.click(botao('Adicionar pergunta'))

      expect(campo('Pergunta 4')).toBeTruthy()
      expect(desabilitado(botao('Adicionar pergunta'))).toBe(true)
      expect(screen.getByText('4 de 4: mais do que isso vira questionário.')).toBeTruthy()
    })

    it('a repetida, sem diferenciar maiúscula, trava o salvar e é apontada', async () => {
      montar()
      await screen.findByText('Defeito')

      abrir('Defeito')
      escrever(campo('Pergunta 3'), 'o que ACONTECEU?')

      expect(screen.getByText(/aparece duas vezes/)).toBeTruthy()
      expect(desabilitado(botao('Salvar'))).toBe(true)

      escrever(campo('Pergunta 3'), 'Em que tela?')
      expect(screen.queryByText(/aparece duas vezes/)).toBeNull()
      expect(desabilitado(botao('Salvar'))).toBe(false)
    })

    it('sem nome não se salva', async () => {
      montar()
      await screen.findByText('Defeito')

      abrir('Melhoria')
      escrever(campo('Nome'), '   ')

      expect(desabilitado(botao('Salvar'))).toBe(true)
    })
  })

  describe('a caixa de texto livre', () => {
    it('sem perguntas e sem a caixa, o tipo não pede nada: o salvar trava e a tela explica', async () => {
      montar()
      await screen.findByText('Melhoria')

      abrir('Melhoria')
      expect(screen.getByText(/Sem perguntas, a caixa é o relato inteiro/)).toBeTruthy()
      fireEvent.click(caixaLivre())

      expect(screen.getByText(/O tipo precisa pedir alguma coisa/)).toBeTruthy()
      expect(desabilitado(botao('Salvar'))).toBe(true)
      expect(screen.queryByRole('textbox', { name: 'Texto dentro da caixa' })).toBeNull()
    })

    it('escondida, o texto dela vai assim mesmo, guardado para quando ela voltar', async () => {
      dublê.mudar.mockImplementation(async (_projeto, _tipo, pedido) => ({
        ...fabrica()[0],
        ...pedido,
      }))
      montar()
      await screen.findByText('Defeito')

      abrir('Defeito')
      expect(screen.getByText(/Depois das perguntas, para o que não coube nelas/)).toBeTruthy()
      fireEvent.click(caixaLivre())
      expect(screen.queryByRole('textbox', { name: 'Texto dentro da caixa' })).toBeNull()
      fireEvent.click(botao('Salvar'))

      await waitFor(() =>
        expect(dublê.mudar).toHaveBeenCalledWith(
          'p-1',
          't-defeito',
          expect.objectContaining({ ShowsTextBox: false, TextBoxPrompt: 'Algo mais?' }),
        ),
      )
      await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nome' })).toBeNull())
      expect(screen.getByText('3 perguntas · entra em Triagem')).toBeTruthy()
    })

    it('aparecendo, exige o texto dela', async () => {
      montar()
      await screen.findByText('Melhoria')

      abrir('Melhoria')
      escrever(campo('Texto dentro da caixa'), '   ')

      expect(desabilitado(botao('Salvar'))).toBe(true)
    })
  })

  describe('reordenar', () => {
    it('a seta grava a ordem e o foco fica nela — ou na outra, quando chega na ponta', async () => {
      dublê.reordenar.mockImplementation(async (_projeto: string, { Order }: { Order: string[] }) =>
        Order.map((publicId) => fabrica().find((item) => item.PublicId === publicId)),
      )
      montar()
      await screen.findByText('Defeito')

      fireEvent.click(botao('Mover Defeito para baixo'))

      await waitFor(() =>
        expect(dublê.reordenar).toHaveBeenCalledWith('p-1', {
          Order: ['t-melhoria', 't-defeito', 't-duvida'],
        }),
      )
      await waitFor(() => expect(document.activeElement).toBe(botao('Mover Defeito para baixo')))
      expect(itens()[1]?.textContent).toContain('Defeito')

      fireEvent.click(botao('Mover Defeito para baixo'))

      await waitFor(() => expect(itens()[2]?.textContent).toContain('Defeito'))
      // Na ponta, a seta de descer trava: o foco passa para a de subir, e nao se perde.
      await waitFor(() => expect(document.activeElement).toBe(botao('Mover Defeito para cima')))
    })

    it('a recusa do servidor devolve a ordem de antes', async () => {
      const { PanelError } = await import('@/data')
      dublê.reordenar.mockRejectedValue(new PanelError('Falhou.', 500))
      montar()
      await screen.findByText('Defeito')

      fireEvent.click(botao('Mover Melhoria para cima'))

      await waitFor(() => expect(avisos().some((aviso) => aviso.tone === 'danger')).toBe(true))
      expect(itens()[0]?.textContent).toContain('Defeito')
    })
  })

  describe('desativar', () => {
    it('pede confirmação, e o que sobra sozinho vira o único ativo, sem botão', async () => {
      dublê.listar.mockResolvedValue(fabrica().slice(0, 2))
      dublê.desativar.mockResolvedValue(
        tipo('t-melhoria', 'Melhoria', 1, { Color: 'Blue', IsActive: false }),
      )
      montar()
      await screen.findByText('Melhoria')

      fireEvent.click(botao('Desativar Melhoria'))
      expect(dublê.desativar).not.toHaveBeenCalled()
      const dialogo = await screen.findByRole('alertdialog')
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Desativar' }))

      await waitFor(() => expect(dublê.desativar).toHaveBeenCalledWith('p-1', 't-melhoria'))
      expect(await screen.findByRole('button', { name: 'Reativar Melhoria' })).toBeTruthy()
      expect(within(resumo('Melhoria')).getByText('Desativado')).toBeTruthy()
      expect(screen.getByText('Único ativo')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Desativar Defeito' })).toBeNull()
    })

    it('o último ativo não oferece o botão, e diz a razão', async () => {
      dublê.listar.mockResolvedValue([
        tipo('t-defeito', 'Defeito', 0),
        tipo('t-melhoria', 'Melhoria', 1, { IsActive: false }),
      ])
      montar()
      await screen.findByText('Defeito')

      expect(screen.getByText('Único ativo')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Desativar Defeito' })).toBeNull()
      expect(botao('Reativar Melhoria')).toBeTruthy()
    })
  })

  describe('o máximo de dez ativos', () => {
    const dez = () =>
      Array.from({ length: 10 }, (_, indice) => tipo(`t-${indice}`, `Tipo ${indice}`, indice))

    it('com dez ativos, criar sai da tela e a razão fica escrita', async () => {
      dublê.listar.mockResolvedValue(dez())
      montar()
      await screen.findByText('Tipo 0')

      expect(screen.queryByRole('button', { name: 'Novo tipo de relato' })).toBeNull()
      expect(screen.getByText(/já tem 10 tipos ativos, o máximo/)).toBeTruthy()
    })

    it('o desativado não conta: com nove ativos, ainda se cria', async () => {
      dublê.listar.mockResolvedValue([
        ...dez().slice(0, 9),
        tipo('t-9', 'Tipo 9', 9, { IsActive: false }),
      ])
      montar()
      await screen.findByText('Tipo 0')

      expect(botao('Novo tipo de relato')).toBeTruthy()
      expect(screen.queryByText(/o máximo/)).toBeNull()
    })

    it('com dez ativos, o desativado diz por que não volta, em vez de um "Reativar" que só recusa', async () => {
      dublê.listar.mockResolvedValue([...dez(), tipo('t-extra', 'Extra', 10, { IsActive: false })])
      montar()
      await screen.findByText('Extra')

      expect(screen.queryByRole('button', { name: 'Reativar Extra' })).toBeNull()
      expect(screen.getByText('Já há 10 ativos')).toBeTruthy()
    })

    it('reativar quando a API já tem dez ativos: vira aviso, e o tipo segue desativado', async () => {
      const { PanelError } = await import('@/data')
      // A tela via nove: outra pessoa reativou um no meio tempo.
      dublê.listar.mockResolvedValue([
        ...dez().slice(0, 9),
        tipo('t-extra', 'Extra', 10, { IsActive: false }),
      ])
      dublê.reativar.mockRejectedValue(
        new PanelError(
          'Este projeto ja tem 10 tipos de relato ativos. Desative um antes de reativar outro.',
          409,
        ),
      )
      montar()
      await screen.findByText('Extra')

      fireEvent.click(botao('Reativar Extra'))

      await waitFor(() => expect(dublê.reativar).toHaveBeenCalledWith('p-1', 't-extra'))
      await waitFor(() =>
        expect(
          avisos().some(
            (aviso) => aviso.tone === 'danger' && /10 tipos de relato ativos/.test(aviso.message),
          ),
        ).toBe(true),
      )
      expect(botao('Reativar Extra')).toBeTruthy()
      expect(within(resumo('Extra')).getByText('Desativado')).toBeTruthy()
    })
  })

  /**
   * A coluna em que o relato entra era uma secao da tela de Colunas, e virou campo do
   * tipo. As tres regras vieram junto: o padrao grava nulo, coluna desativada nao e
   * destino, e o padrao diz o nome da primeira coluna **ativa**.
   */
  describe('a coluna em que o tipo entra', () => {
    const desativada = (publicId: string, name: string, position: number) => ({
      ...coluna(publicId, name, position),
      IsActive: false,
    })

    async function abrirOpcoes(tipoNome: string) {
      montar()
      await screen.findByText(tipoNome, { selector: 'summary span' })
      abrir(tipoNome)
      const gatilho = await screen.findByRole('combobox', { name: 'Coluna em que entra' })
      fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false, pointerType: 'mouse' })
      return screen.getAllByRole('option').map((opcao) => opcao.textContent)
    }

    it('a opcao padrao apaga a escolha em vez de gravar uma vazia', async () => {
      dublê.mudar.mockImplementation(async (_: string, publicId: string, pedido: object) => ({
        ...fabrica()[0],
        ...pedido,
        PublicId: publicId,
      }))
      montar()
      await screen.findByText('Defeito')
      abrir('Defeito')

      // O gatilho mostra o que esta escolhido.
      const gatilho = await screen.findByRole('combobox', { name: 'Coluna em que entra' })
      expect(gatilho.textContent).toContain('Triagem')

      await escolherNoSelect(screen, fireEvent, 'Coluna em que entra', /^A primeira coluna/)
      fireEvent.click(botao('Salvar'))

      // Nulo, e nao string vazia: e o que faz o tipo seguir a primeira coluna ativa
      // mesmo depois de alguem reordenar. '' apontaria para lugar nenhum.
      await waitFor(() =>
        expect(dublê.mudar).toHaveBeenCalledWith(
          'p-1',
          't-defeito',
          expect.objectContaining({ InitialStatePublicId: null }),
        ),
      )
    })

    it('nao oferece coluna desativada, a nao ser a ja escolhida', async () => {
      dublê.colunas.mockResolvedValue([
        coluna('s-1', 'Análise', 0),
        desativada('s-triagem', 'Parado', 1),
        coluna('s-3', 'Pronto', 2),
      ])

      // A Melhoria segue o padrao: "Parado" nao e destino. Mandar relato novo para
      // ele desfaria pela porta dos fundos o que desativar decidiu.
      expect(await abrirOpcoes('Melhoria')).toEqual([
        'A primeira coluna (hoje: Análise)',
        'Análise',
        'Pronto',
      ])
    })

    it('a coluna desativada que ja era a escolhida continua na lista, marcada', async () => {
      dublê.colunas.mockResolvedValue([
        coluna('s-1', 'Análise', 0),
        desativada('s-triagem', 'Parado', 1),
        coluna('s-3', 'Pronto', 2),
      ])

      // O Defeito aponta para "Parado": sem ela na lista, o campo apareceria em branco.
      expect(await abrirOpcoes('Defeito')).toEqual([
        'A primeira coluna (hoje: Análise)',
        'Análise',
        'Parado (desativada)',
        'Pronto',
      ])
    })

    it('o padrao mostra a primeira coluna ativa, e nao a primeira da lista', async () => {
      // "Análise" esta desativada: quem nao escolheu cai em "Corrigindo", e e esse nome
      // que precisa aparecer.
      dublê.colunas.mockResolvedValue([
        desativada('s-1', 'Análise', 0),
        coluna('s-2', 'Corrigindo', 1),
        coluna('s-3', 'Pronto', 2),
      ])

      const opcoes = await abrirOpcoes('Melhoria')
      expect(opcoes[0]).toBe('A primeira coluna (hoje: Corrigindo)')
    })
  })
})
