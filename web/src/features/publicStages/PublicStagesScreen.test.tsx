// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectPublicStageViewModel,
  ProjectStatusMappingViewModel,
  ProjectViewModel,
} from '@/contracts'
import { PanelError } from '@/data'
import { PublicStagesScreen } from '@/features/publicStages/PublicStagesScreen'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

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
 * **O piso trava o botao de apagar.** E o unico lugar onde a regra do minimo
 * aparece antes de o servidor dizer nao — sem ele, a pessoa clica, leva uma
 * recusa e nao entende por que. O verbo e "Apagar", como nas Etiquetas: e o que
 * acontece (antes era "Remover").
 *
 * **Fechada, a etapa diz o que e em palavras**, e avisa com o caminho o que falta: a
 * etapa em que nenhuma coluna cai leva a Colunas, e a jornada sem fim diz "Sem etapa
 * final". **A previa e a linha do tempo de verdade**, com o rascunho da etapa aberta e
 * o "agora" onde a pessoa escolheu. E trocar de etapa com mudanca pergunta antes.
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
    // A tela le o mapa so para mostrar, em cada etapa, as colunas que caem nela.
    dublê.mapa.mockResolvedValue({ Version: 0, Entries: [], UnmappedCount: 0 })
  })

  it('cada etapa diz as colunas que caem nela, e a ligação se escolhe só em Colunas', async () => {
    dublê.listar.mockResolvedValue([etapa('e-1', 'Recebido', 0), etapa('e-2', 'Resolvido', 1)])
    dublê.mapa.mockResolvedValue({
      Version: 3,
      UnmappedCount: 0,
      Entries: [
        {
          StatePublicId: 's-1',
          StateName: 'A fazer',
          StateIsActive: true,
          StagePublicId: 'e-1',
          StageLabel: 'Recebido',
        },
        {
          StatePublicId: 's-2',
          StateName: 'Triagem',
          StateIsActive: true,
          StagePublicId: 'e-1',
          StageLabel: 'Recebido',
        },
      ],
    })
    montar()

    expect(await screen.findByText('Colunas: A fazer, Triagem')).toBeTruthy()
    // A etapa sem coluna avisa, e o aviso leva a ligacao, que mora em Colunas.
    const semColuna = screen.getByText(/Nenhuma coluna cai aqui/)
    expect(
      within(semColuna).getByRole('link', { name: 'Ligar em Colunas' }).getAttribute('href'),
    ).toBe('/states#colunas-no-andamento')
    // Uma so: a etapa que tem coluna nao avisa.
    expect(screen.getAllByText(/Nenhuma coluna cai aqui/)).toHaveLength(1)
    // Nenhuma escolha de coluna aqui: um lugar so, e o link leva a ele.
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Salvar mapeamento' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Colunas' }).getAttribute('href')).toBe(
      '/states#colunas-no-andamento',
    )
    // A tela so le a ligacao.
    expect(dublê.mapa).toHaveBeenCalledWith('p-1')
  })

  it('fechada, cada etapa diz o que é em palavras', async () => {
    dublê.listar.mockResolvedValue([
      etapa('e-1', 'Recebido', 0),
      etapa('e-2', 'Aguardando você', 1, { AwaitsReporter: true }),
      etapa('e-3', 'Concluído', 2, { IsTerminal: true, Outcome: 'Done', AllowsReturn: true }),
    ])
    dublê.mapa.mockResolvedValue({
      Version: 1,
      UnmappedCount: 0,
      Entries: [
        {
          StatePublicId: 's-1',
          StateName: 'Feito',
          StateIsActive: true,
          StagePublicId: 'e-3',
          StageLabel: 'Concluído',
        },
        {
          StatePublicId: 's-2',
          StateName: 'Arquivado',
          StateIsActive: true,
          StagePublicId: 'e-3',
          StageLabel: 'Concluído',
        },
      ],
    })
    montar()

    expect(
      await screen.findByText('Termina · Foi feito · Pode voltar · Colunas: Feito, Arquivado'),
    ).toBeTruthy()
    expect(screen.getByText('Espera quem relatou')).toBeTruthy()
    // Sem marca e sem coluna, a frase da etapa: o cabecalho nunca fica so com o nome.
    expect(within(lista()).getByText('O que acontece em Recebido.')).toBeTruthy()
    // Com etapa final, nada de aviso de que ela falta.
    expect(screen.queryByText('Sem etapa final')).toBeNull()
  })

  it('avisa quando nenhuma etapa termina a jornada', async () => {
    dublê.listar.mockResolvedValue([
      etapa('e-1', 'Recebido', 0),
      etapa('e-2', 'Em análise', 1),
      etapa('e-3', 'Pronto', 2),
    ])
    montar()

    expect(await screen.findByText('Sem etapa final')).toBeTruthy()
  })

  it('o título diz que cada mudança vale na hora', async () => {
    dublê.listar.mockResolvedValue([etapa('e-1', 'Recebido', 0)])
    montar()

    expect(screen.getByRole('heading', { level: 1, name: 'Andamento público' })).toBeTruthy()
    expect(screen.getByText('Cada mudança vale na hora')).toBeTruthy()
    expect(screen.getByText('Como funciona')).toBeTruthy()
  })

  it('a prévia é a linha do tempo, com o rascunho da etapa aberta e o "agora" escolhido', async () => {
    dublê.listar.mockResolvedValue([
      etapa('e-1', 'Recebido', 0),
      etapa('e-2', 'Em análise', 1),
      etapa('e-3', 'Pronto', 2),
    ])
    montar()
    await screen.findAllByText('Recebido')

    // Sem nada aberto, o relato esta na primeira etapa.
    expect(naPrevia('Recebido').getAttribute('aria-pressed')).toBe('true')

    // Abrir uma etapa leva o "agora" ate ela, e o que se escreve aparece antes de salvar.
    abrir('Em análise')
    expect(naPrevia('Em análise').getAttribute('aria-pressed')).toBe('true')
    escrever('Como esta etapa se chama', 'Lendo o seu relato')
    escrever('O que vem depois (opcional)', 'A equipe decide o que fazer.')

    const previa = document.getElementById('previa') as HTMLElement
    expect(within(previa).getByText('Lendo o seu relato')).toBeTruthy()
    expect(within(previa).getByText('A equipe decide o que fazer.')).toBeTruthy()
    expect(within(previa).getByText('ainda não salvo')).toBeTruthy()
    expect(within(previa).getAllByLabelText('Já passou por aqui')).toHaveLength(1)

    // Clicar numa etapa da previa poe o relato nela.
    fireEvent.click(naPrevia('Pronto'))
    expect(naPrevia('Pronto').getAttribute('aria-pressed')).toBe('true')
    expect(within(previa).getAllByLabelText('Já passou por aqui')).toHaveLength(2)
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('com mudança, abrir outra etapa pergunta antes', async () => {
    dublê.listar.mockResolvedValue([
      etapa('e-1', 'Recebido', 0),
      etapa('e-2', 'Em análise', 1),
      etapa('e-3', 'Pronto', 2),
    ])
    montar()
    await screen.findAllByText('Recebido')

    abrir('Recebido')
    escrever('Como esta etapa se chama', 'Chegou')
    abrir('Em análise')

    const dialogo = await screen.findByRole('alertdialog')
    expect(dialogo.textContent).toContain('Descartar o que mudou em “Recebido”?')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar editando' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(campo('Como esta etapa se chama').value).toBe('Chegou')

    abrir('Em análise')
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
    )
    await waitFor(() => expect(campo('Como esta etapa se chama').value).toBe('Em análise'))
    expect(dublê.salvar).not.toHaveBeenCalled()
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
    await screen.findAllByText('Recebido')
    abrir('Pronto')

    // Antes de marcar, a etapa esta completa e da para salvar.
    expect(botaoSalvar().disabled).toBe(false)

    fireEvent.click(screen.getByRole('checkbox', { name: 'O relato termina nesta etapa' }))

    expect(botaoSalvar().disabled).toBe(true)
    expect(dublê.salvar).not.toHaveBeenCalled()

    // O desfecho e escolhido em pecas com desenho, e nao numa lista que abre.
    fireEvent.click(screen.getByRole('radio', { name: 'Não será feito' }))

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
    await screen.findAllByText('Recebido')
    abrir('Concluído')
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
    await screen.findAllByText('Recebido')
    abrir('Recebido')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Esta jornada já tem uma etapa com este nome.')).toBeTruthy()
    // O que foi digitado continua ali: fechar faria a pessoa escrever tudo de novo.
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeTruthy()
  })

  it('trava o botão de apagar quando a jornada está no mínimo', async () => {
    dublê.listar.mockResolvedValue([
      etapa('e-1', 'Recebido', 0),
      etapa('e-2', 'Em análise', 1),
      etapa('e-3', 'Pronto', 2),
    ])

    montar()
    const remover = await screen.findAllByRole('button', { name: /^Apagar / })

    expect(remover).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull()
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
    await screen.findAllByText('Recebido')

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

/** A lista das etapas — a previa desenha outra lista com os mesmos rotulos. */
const lista = () => screen.getByRole('list', { name: 'Etapas do andamento' })

/** Clica no cabecalho de uma etapa da lista: abre ou fecha o item. */
function abrir(rotulo: string) {
  const alvo = within(lista())
    .getAllByText(rotulo)
    .find((elemento) => elemento.closest('summary'))
  fireEvent.click(alvo as HTMLElement)
}

const campo = (nome: string) => screen.getByRole('textbox', { name: nome }) as HTMLInputElement

function escrever(nome: string, valor: string) {
  fireEvent.change(campo(nome), { target: { value: valor } })
}

/** A etapa na previa: o botao que poe o relato nela. */
const naPrevia = (rotulo: string) =>
  within(document.getElementById('previa') as HTMLElement).getByRole('button', {
    name: `Ver o relato em ${rotulo}`,
  })

/** Os rotulos da jornada, na ordem em que estao desenhados na lista (e nao na previa). */
const rotulosNaTela = () =>
  Array.from(lista().querySelectorAll(':scope > li summary span.font-medium')).map(
    (item) => item.textContent ?? '',
  )
