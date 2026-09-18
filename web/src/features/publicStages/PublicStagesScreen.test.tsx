// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectPublicStageViewModel,
  ProjectStatusMappingViewModel,
  ProjectViewModel,
} from '@/contracts'
import { PanelError } from '@/data'
import { PublicStagesScreen } from '@/features/publicStages/PublicStagesScreen'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A ordem sai inteira.** Mesma regra da fila de trabalho, e mesma facilidade de
 * quebrar sem perceber: uma lista parcial faz a API recusar por incompleta, ou
 * pior, deixa a posicao de quem ficou de fora virar sorteio.
 *
 * **Etapa terminal nao sai sem desfecho, e desmarcar leva o desfecho junto.** Sao
 * os dois lados da mesma regra, e o segundo e o esquecido: quem marca "termina
 * aqui", escolhe um desfecho e depois desmarca deixaria um final no meio da
 * jornada — que a linha do tempo nao teria como desenhar. A API recusa os dois
 * casos; a tela precisa nao chegar la.
 *
 * **Recusa nao fecha o formulario.** Rotulo repetido e texto comprido tem o que
 * corrigir, e fechar a caixa faria a pessoa digitar tudo de novo para ler a
 * mensagem.
 *
 * **O piso esconde o botao de remover.** E o unico lugar onde a regra do minimo
 * aparece antes de o servidor dizer nao — sem ele, a pessoa clica, leva uma
 * recusa e nao entende por que.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<() => Promise<ProjectPublicStageViewModel[]>>(),
  criar: vi.fn(),
  salvar: vi.fn(),
  remover: vi.fn(),
  reordenar: vi.fn(),
  padrao: vi.fn(),
  mapa: vi.fn<() => Promise<ProjectStatusMappingViewModel>>(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectPublicStageService: {
      listPublicStages: dublê.listar,
      addPublicStage: dublê.criar,
      updatePublicStage: dublê.salvar,
      removePublicStage: dublê.remover,
      reorderPublicStages: dublê.reordenar,
      applyFactoryPublicStages: dublê.padrao,
    },
    projectStatusMappingService: {
      getStatusMapping: dublê.mapa,
      saveStatusMapping: vi.fn(),
    },
  }
})

function etapa(
  publicId: string,
  label: string,
  position: number,
  extra: Partial<ProjectPublicStageViewModel> = {},
): ProjectPublicStageViewModel {
  return {
    PublicId: publicId,
    Label: label,
    Description: `O que acontece em ${label}.`,
    NextStep: null,
    Position: position,
    IsTerminal: false,
    AllowsReturn: false,
    AwaitsReporter: false,
    Outcome: null,
    CreatedAt: '2026-09-01T12:00:00.000Z',
    ...extra,
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
        children: [{ index: true, element: <PublicStagesScreen /> }],
      },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)
}

// A caixa de escolha do produto desenha a propria lista, e o jsdom nao tem o que
// ela usa para abrir. Sem isto o teste falharia pelo ambiente, nao pelo codigo.
instalarRemendosDoRadix()

describe('PublicStagesScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    // A tela busca as duas coisas. Sem esta resposta a seção de mapeamento cai no
    // caminho de falha, e os testes passariam olhando uma tela meio quebrada — foi
    // exatamente assim que a primeira versão deste arquivo passou.
    dublê.mapa.mockResolvedValue({ Version: 0, Entries: [], UnmappedCount: 0 })
  })

  it('manda a jornada inteira ao reordenar', async () => {
    dublê.listar.mockResolvedValue([
      etapa('e-1', 'Recebido', 0),
      etapa('e-2', 'Em análise', 1),
      etapa('e-3', 'Concluído', 2, { IsTerminal: true, Outcome: 'Done' }),
    ])
    dublê.reordenar.mockImplementation(async (_: string, pedido: { Order: string[] }) => {
      const mapa = new Map([
        ['e-1', etapa('e-1', 'Recebido', 0)],
        ['e-2', etapa('e-2', 'Em análise', 1)],
        ['e-3', etapa('e-3', 'Concluído', 2, { IsTerminal: true, Outcome: 'Done' })],
      ])
      return pedido.Order.map((publicId, posicao) => ({
        ...(mapa.get(publicId) as ProjectPublicStageViewModel),
        Position: posicao,
      }))
    })

    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Mover Recebido para baixo' }))

    await waitFor(() => expect(dublê.reordenar).toHaveBeenCalledTimes(1))
    expect(dublê.reordenar.mock.calls[0]?.[1]).toEqual({ Order: ['e-2', 'e-1', 'e-3'] })
  })

  it('devolve a ordem anterior quando a gravação falha', async () => {
    dublê.listar.mockResolvedValue([etapa('e-1', 'Recebido', 0), etapa('e-2', 'Concluído', 1)])
    dublê.reordenar.mockRejectedValue(new Error('sem rede'))

    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Mover Recebido para baixo' }))

    await waitFor(() => expect(dublê.reordenar).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(rotulosNaTela()).toEqual(['Recebido', 'Concluído']))
  })

  it('não deixa salvar etapa que termina sem desfecho escolhido', async () => {
    dublê.listar.mockResolvedValue([
      etapa('e-1', 'Recebido', 0),
      etapa('e-2', 'Em análise', 1),
      etapa('e-3', 'Pronto', 2),
    ])

    montar()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Editar' }))[2] as HTMLElement)

    // Antes de marcar, a etapa esta completa e da para salvar.
    expect(botaoSalvar().disabled).toBe(false)

    fireEvent.click(screen.getByRole('checkbox', { name: 'O relato termina nesta etapa' }))

    expect(botaoSalvar().disabled).toBe(true)
    expect(dublê.salvar).not.toHaveBeenCalled()

    await escolherNoSelect(screen, fireEvent, 'Como o relato termina aqui', 'Não será feito')

    expect(botaoSalvar().disabled).toBe(false)
  })

  it('tira o desfecho junto ao desmarcar que a etapa termina', async () => {
    dublê.listar.mockResolvedValue([
      etapa('e-1', 'Recebido', 0),
      etapa('e-2', 'Em análise', 1),
      etapa('e-3', 'Concluído', 2, { IsTerminal: true, Outcome: 'Done' }),
    ])
    dublê.salvar.mockImplementation(
      async (_: string, __: string, pedido: ProjectPublicStageViewModel) => ({
        ...etapa('e-3', pedido.Label, 2),
        ...pedido,
      }),
    )

    montar()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Editar' }))[2] as HTMLElement)
    fireEvent.click(screen.getByRole('checkbox', { name: 'O relato termina nesta etapa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    // Desmarcar sem levar o desfecho junto mandaria um final no meio da jornada.
    expect(dublê.salvar.mock.calls[0]?.[2]).toMatchObject({ IsTerminal: false, Outcome: null })
  })

  it('mantém o formulário aberto, com a mensagem, quando a API recusa', async () => {
    dublê.listar.mockResolvedValue([
      etapa('e-1', 'Recebido', 0),
      etapa('e-2', 'Em análise', 1),
      etapa('e-3', 'Pronto', 2),
    ])
    // `PanelError` e nao `Error`: so a primeira carrega a mensagem do servidor
    // ate a tela. Um `Error` cru viraria o texto generico, e o teste passaria
    // sem provar que a recusa da API chega a quem esta digitando.
    dublê.salvar.mockRejectedValue(
      new PanelError('Esta jornada já tem uma etapa com este nome.', 409),
    )

    montar()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Editar' }))[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Esta jornada já tem uma etapa com este nome.')).toBeTruthy()
    // O que foi digitado continua ali: fechar faria a pessoa escrever tudo de novo.
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeTruthy()
  })

  it('esconde o botão de remover quando a jornada está no mínimo', async () => {
    dublê.listar.mockResolvedValue([
      etapa('e-1', 'Recebido', 0),
      etapa('e-2', 'Em análise', 1),
      etapa('e-3', 'Pronto', 2),
    ])

    montar()
    const remover = await screen.findAllByRole('button', { name: 'Remover' })

    expect(remover).toHaveLength(3)
    for (const botao of remover) expect((botao as HTMLButtonElement).disabled).toBe(true)
  })

  it('avisa que a jornada incompleta já está sendo mostrada a quem relata', async () => {
    // Duas etapas: abaixo do minimo, e nenhuma regra impede — o piso so e conferido
    // na remocao, para a jornada poder sair do zero uma etapa por vez. Entao esta
    // jornada de dois passos **ja sai** para quem relatou, e a tela precisa dizer.
    dublê.listar.mockResolvedValue([etapa('e-1', 'Recebido', 0), etapa('e-2', 'Pronto', 1)])

    montar()

    const aviso = await screen.findByText(/já está sendo mostrada a quem relata/)
    expect(aviso.textContent).toContain('2 passos')
  })

  it('não avisa quando a jornada chegou ao mínimo', async () => {
    // Tres e o minimo, e nao um problema. Sem este caso, o aviso poderia ser escrito
    // com `<=` e passaria no teste de cima aparecendo onde nao devia.
    dublê.listar.mockResolvedValue([
      etapa('e-1', 'Recebido', 0),
      etapa('e-2', 'Em análise', 1),
      etapa('e-3', 'Pronto', 2),
    ])

    montar()
    await screen.findByText('Recebido')

    expect(screen.queryByText(/já está sendo mostrada a quem relata/)).toBeNull()
  })

  it('preenche a jornada vazia com o conjunto padrão', async () => {
    dublê.listar.mockResolvedValue([])
    dublê.padrao.mockResolvedValue([
      etapa('f-1', 'Recebido', 0),
      etapa('f-2', 'Em análise', 1),
      etapa('f-3', 'Concluído', 2, { IsTerminal: true, Outcome: 'Done' }),
    ])

    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar o conjunto padrão' }))

    await waitFor(() => expect(dublê.padrao).toHaveBeenCalledWith('p-1'))
    // O que aparece e o que a API devolveu, e nao uma copia do padrao escrita aqui.
    await waitFor(() => expect(rotulosNaTela()).toEqual(['Recebido', 'Em análise', 'Concluído']))
  })
})

/** O botao de salvar do formulario aberto. */
const botaoSalvar = () => screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement

/**
 * Os rotulos da jornada, na ordem em que estao desenhados.
 *
 * Olha so dentro do `ol`: a secao de mapeamento desenha um `ul` logo abaixo, e
 * `getAllByRole('listitem')` traria as duas listas misturadas.
 */
const rotulosNaTela = () =>
  Array.from(document.querySelectorAll('ol > li')).map(
    (item) => item.querySelector('span.font-medium')?.textContent ?? '',
  )
