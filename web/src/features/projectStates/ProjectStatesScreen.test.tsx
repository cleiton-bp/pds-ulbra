// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectInitialStateViewModel,
  ProjectStateViewModel,
  ProjectViewModel,
} from '@/contracts'
import { ProjectStatesScreen } from '@/features/projectStates/ProjectStatesScreen'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A ordem sai inteira, com os aposentados dentro.** E a regra mais facil de
 * quebrar sem perceber: bastaria a tela mandar so os ativos — o que parece
 * razoavel, ja que o aposentado nao recebe relato — para a API recusar a lista
 * por incompleta, ou pior, para a posicao de quem ficou de fora virar sorteio.
 *
 * **A seta e otimista, e o erro tem desfazer.** A linha muda de lugar antes da
 * resposta porque seta que espera parece quebrada; a contrapartida e que a falha
 * precisa devolver a lista para a ordem anterior, senao a tela mostra uma ordem
 * que o banco nao tem.
 *
 * **Aposentar nao e apagar.** A linha continua na lista depois de confirmar. Este
 * e o teste de honestidade: o dia em que alguem "limpar" a tela escondendo o
 * aposentado, o historico dos relatos que passaram por ele fica sem nome.
 *
 * **O nome que aparece e o que a API devolveu.** Ela junta os espacos repetidos;
 * reaproveitar o texto digitado deixaria "Em   analise" na tela ate recarregar. A
 * asserticao olha o `textContent` cru de proposito: a primeira versao deste teste
 * usava `findByText`, que normaliza o espaco antes de procurar — ele passava com
 * a tela mostrando o texto digitado, e so a mutacao mostrou isso.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<() => Promise<ProjectStateViewModel[]>>(),
  criar: vi.fn(),
  renomear: vi.fn(),
  reordenar: vi.fn(),
  aposentar: vi.fn(),
  reativar: vi.fn(),
  listarEntradas: vi.fn<() => Promise<ProjectInitialStateViewModel[]>>(),
  salvarEntrada: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectStateService: {
      listProjectStates: dublê.listar,
      addProjectState: dublê.criar,
      renameProjectState: dublê.renomear,
      reorderProjectStates: dublê.reordenar,
      deactivateProjectState: dublê.aposentar,
      activateProjectState: dublê.reativar,
      listInitialStates: dublê.listarEntradas,
      setInitialState: dublê.salvarEntrada,
    },
  }
})

function entrada(
  reportType: ProjectInitialStateViewModel['ReportType'],
  statePublicId: string | null = null,
): ProjectInitialStateViewModel {
  return { ReportType: reportType, StatePublicId: statePublicId }
}

function estado(
  publicId: string,
  name: string,
  position: number,
  isActive = true,
): ProjectStateViewModel {
  return {
    PublicId: publicId,
    Name: name,
    Position: position,
    IsActive: isActive,
    CreatedAt: '2026-09-01T12:00:00.000Z',
  }
}

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: '2026-08-01T12:00:00.000Z',
  UpdatedAt: '2026-08-01T12:00:00.000Z',
}

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ project: projeto }} />,
        children: [{ index: true, element: <ProjectStatesScreen /> }],
      },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)
}

/** Os nomes na ordem em que estao desenhados. */
const nomesNaTela = () =>
  screen.getAllByRole('listitem').map((item) => item.textContent?.split('Renomear')[0]?.trim())

// A caixa de escolha do produto desenha a propria lista, e o jsdom nao tem o
// que ela usa para abrir. Sem isto o teste falharia pelo ambiente, nao pelo codigo.
instalarRemendosDoRadix()

describe('ProjectStatesScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    // Os testes da fila nao falam da secao de entrada, mas a tela busca as duas
    // coisas: sem esta resposta o componente cai no caminho de falha, e os testes
    // passariam olhando uma tela meio quebrada.
    dublê.listarEntradas.mockResolvedValue([])
  })

  it('manda a fila inteira ao reordenar, com o aposentado dentro', async () => {
    dublê.listar.mockResolvedValue([
      estado('s-1', 'Análise', 0),
      estado('s-2', 'Parado', 1, false),
      estado('s-3', 'Pronto', 2),
    ])
    dublê.reordenar.mockImplementation(async (_: string, pedido: { Order: string[] }) => {
      const mapa = new Map([
        ['s-1', estado('s-1', 'Análise', 0)],
        ['s-2', estado('s-2', 'Parado', 1, false)],
        ['s-3', estado('s-3', 'Pronto', 2)],
      ])
      return pedido.Order.map((publicId, posicao) => ({
        ...(mapa.get(publicId) as ProjectStateViewModel),
        Position: posicao,
      }))
    })

    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Mover Análise para baixo' }))

    await waitFor(() => expect(dublê.reordenar).toHaveBeenCalledTimes(1))
    // Os tres, uma vez cada, na ordem nova — e nao so os dois ativos.
    expect(dublê.reordenar.mock.calls[0]?.[1]).toEqual({ Order: ['s-2', 's-1', 's-3'] })
  })

  it('devolve a ordem anterior quando a gravação falha', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'Análise', 0), estado('s-2', 'Pronto', 1)])
    dublê.reordenar.mockRejectedValue(new Error('sem rede'))

    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Mover Análise para baixo' }))

    // Trocou de lugar na hora, sem esperar a resposta.
    await waitFor(() => expect(nomesNaTela()).toEqual(['Pronto', 'Análise']))
    // E voltou, porque o servidor recusou.
    await waitFor(() => expect(nomesNaTela()).toEqual(['Análise', 'Pronto']))
  })

  it('aposentar mantém o estado na lista, marcado', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'Análise', 0), estado('s-2', 'Pronto', 1)])
    dublê.aposentar.mockResolvedValue(estado('s-2', 'Pronto', 1, false))

    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Aposentar Pronto' }))
    // O botao do dialogo e o unico chamado so "Aposentar": os da lista trazem o
    // nome do estado junto.
    fireEvent.click(await screen.findByRole('button', { name: 'Aposentar', hidden: true }))

    await waitFor(() => expect(dublê.aposentar).toHaveBeenCalledWith('p-1', 's-2'))
    // Continua na lista, no lugar onde estava.
    await waitFor(() => expect(nomesNaTela()).toEqual(['Análise', 'ProntoAposentado']))
    expect(screen.getByRole('button', { name: 'Reativar Pronto' })).toBeTruthy()
  })

  it('mostra o nome que a API devolveu, e não o que foi digitado', async () => {
    dublê.listar.mockResolvedValue([])
    dublê.criar.mockResolvedValue(estado('s-1', 'Em análise', 0))

    montar()

    const campo = await screen.findByRole('textbox', { name: 'Nome do estado' })
    fireEvent.change(campo, { target: { value: '  Em   análise  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar estado' }))

    // Comparado pelo `textContent` cru: `findByText` junta os espacos repetidos
    // antes de procurar, entao ele acharia o nome nao normalizado do mesmo jeito
    // — e o teste passaria com a tela mostrando o texto digitado.
    await waitFor(() => expect(nomesNaTela()).toEqual(['Em análise']))
  })

  it('a opção padrão apaga a escolha em vez de gravar uma vazia', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'Análise', 0), estado('s-2', 'Pronto', 1)])
    dublê.listarEntradas.mockResolvedValue([
      entrada('Bug', 's-2'),
      entrada('Improvement'),
      entrada('Question'),
    ])
    dublê.salvarEntrada.mockResolvedValue(entrada('Bug'))

    montar()

    // O gatilho mostra o que está escolhido; a lista é nossa, não do sistema.
    const gatilho = await screen.findByRole('combobox', {
      name: 'Onde entra um relato do tipo Defeito',
    })
    expect(gatilho.textContent).toContain('Pronto')

    await escolherNoSelect(
      screen,
      fireEvent,
      'Onde entra um relato do tipo Defeito',
      /^Seguir a fila/,
    )

    // Nulo, e nao string vazia: e o que apaga a linha no banco e devolve o tipo
    // ao padrão. Mandar '' gravaria uma escolha que aponta para lugar nenhum.
    await waitFor(() =>
      expect(dublê.salvarEntrada).toHaveBeenCalledWith('p-1', {
        ReportType: 'Bug',
        StatePublicId: null,
      }),
    )
  })

  it('não oferece estado aposentado como entrada, a não ser o já escolhido', async () => {
    dublê.listar.mockResolvedValue([
      estado('s-1', 'Análise', 0),
      estado('s-2', 'Parado', 1, false),
      estado('s-3', 'Pronto', 2),
    ])
    dublê.listarEntradas.mockResolvedValue([
      entrada('Bug'),
      entrada('Improvement'),
      entrada('Question'),
    ])

    montar()

    const gatilho = await screen.findByRole('combobox', {
      name: 'Onde entra um relato do tipo Defeito',
    })
    fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false, pointerType: 'mouse' })

    const opcoes = screen.getAllByRole('option').map((o) => o.textContent)

    // "Parado" está aposentado: mandar relato novo para ele desfaria pela porta
    // dos fundos o que aposentar decidiu.
    expect(opcoes).toEqual(['Seguir a fila (hoje: Análise)', 'Análise', 'Pronto'])
  })

  it('o padrão mostra a primeira coluna ativa, e não a primeira da lista', async () => {
    // "Análise" está aposentada: quem não escolheu cai em "Corrigindo", e é esse
    // nome que precisa aparecer. Dizer "primeira coluna da fila" seria uma frase
    // que vira mentira no dia em que alguém aposenta a primeira.
    dublê.listar.mockResolvedValue([
      estado('s-1', 'Análise', 0, false),
      estado('s-2', 'Corrigindo', 1),
      estado('s-3', 'Pronto', 2),
    ])
    dublê.listarEntradas.mockResolvedValue([
      entrada('Bug'),
      entrada('Improvement'),
      entrada('Question'),
    ])

    montar()

    const gatilho = await screen.findByRole('combobox', {
      name: 'Onde entra um relato do tipo Defeito',
    })
    fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false, pointerType: 'mouse' })

    expect(screen.getAllByRole('option')[0]?.textContent).toBe('Seguir a fila (hoje: Corrigindo)')
  })

  it('arrastar reordena na tela e grava a fila inteira uma vez só', async () => {
    dublê.listar.mockResolvedValue([
      estado('s-1', 'Análise', 0),
      estado('s-2', 'Parado', 1, false),
      estado('s-3', 'Pronto', 2),
    ])
    dublê.reordenar.mockImplementation(async (_: string, pedido: { Order: string[] }) => {
      const mapa = new Map([
        ['s-1', estado('s-1', 'Análise', 0)],
        ['s-2', estado('s-2', 'Parado', 1, false)],
        ['s-3', estado('s-3', 'Pronto', 2)],
      ])
      return pedido.Order.map((publicId, posicao) => ({
        ...(mapa.get(publicId) as ProjectStateViewModel),
        Position: posicao,
      }))
    })

    montar()
    await screen.findByText('Análise')

    const linhas = screen.getAllByRole('listitem')
    const primeira = linhas[0] as HTMLElement
    const terceira = linhas[2] as HTMLElement

    // A alça é o que liga o arrasto: sem ela a linha não é arrastável, para
    // selecionar o nome com o mouse não virar um arrasto.
    fireEvent.mouseDown(primeira.querySelector('button') as HTMLElement)
    fireEvent.dragStart(primeira)
    fireEvent.dragEnter(terceira)

    // A lista se reorganiza com o dedo em cima, e não só ao soltar.
    await waitFor(() => expect(nomesNaTela()).toEqual(['ParadoAposentado', 'Pronto', 'Análise']))
    expect(dublê.reordenar).not.toHaveBeenCalled()

    fireEvent.drop(terceira)

    // Uma gravação só, com a fila inteira e o aposentado dentro.
    await waitFor(() => expect(dublê.reordenar).toHaveBeenCalledTimes(1))
    expect(dublê.reordenar.mock.calls[0]?.[1]).toEqual({ Order: ['s-2', 's-3', 's-1'] })
  })

  it('soltar sem ter mudado de lugar não grava nada', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'Análise', 0), estado('s-2', 'Pronto', 1)])

    montar()
    await screen.findByText('Análise')

    const primeira = screen.getAllByRole('listitem')[0] as HTMLElement
    fireEvent.mouseDown(primeira.querySelector('button') as HTMLElement)
    fireEvent.dragStart(primeira)
    fireEvent.drop(primeira)

    // Pegar e largar no mesmo lugar é desistir, e desistir não é uma gravação.
    await waitFor(() => expect(nomesNaTela()).toEqual(['Análise', 'Pronto']))
    expect(dublê.reordenar).not.toHaveBeenCalled()
  })
})
