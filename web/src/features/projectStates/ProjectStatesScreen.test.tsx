// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CycleSettingsViewModel,
  ProjectInitialStateViewModel,
  ProjectPublicStageViewModel,
  ProjectStateViewModel,
  ProjectStatusMappingViewModel,
  ProjectViewModel,
  ReportStateCountViewModel,
} from '@/contracts'
import { ProjectStatesScreen } from '@/features/projectStates/ProjectStatesScreen'
import { useToastStore } from '@/shared/components/toastStore'
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
 * **Desativar nao e apagar.** A linha continua na lista depois de confirmar,
 * marcada "Desativada". Este e o teste de honestidade: o dia em que alguem "limpar"
 * a tela escondendo a desativada, o historico dos relatos que passaram por ela fica
 * sem nome. E a pergunta diz **quantos cards estao nela** — o tamanho do efeito.
 *
 * **Cada coluna diz o que quem relatou ve**, e trocar grava o mapa inteiro (cada
 * gravacao e uma versao, o retrato do conjunto). A coluna nova nasce ligada a etapa
 * da ultima coluna ativa de antes — sem isso, quem relatou continuava lendo
 * "Recebido" com o relato ja na coluna nova, e ninguem percebia.
 *
 * **As regras do quadro moram aqui, e voltam inteiras.** Sao campos do registro do
 * ciclo: o salvar daqui manda o que leu, com so os dois campos mudados — mandar so os
 * visiveis apagaria o encerramento e as sprints. E nelas zero quer dizer alguma
 * coisa ("mostra todos"), ao contrario dos prazos do Ciclo.
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
  contar: vi.fn<() => Promise<ReportStateCountViewModel[]>>(),
  etapas: vi.fn<() => Promise<ProjectPublicStageViewModel[]>>(),
  lerMapa: vi.fn<() => Promise<ProjectStatusMappingViewModel>>(),
  salvarMapa: vi.fn(),
  lerRegras: vi.fn<() => Promise<CycleSettingsViewModel>>(),
  salvarRegras: vi.fn(),
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
    // A tela le tambem o que quem relatou ve em cada coluna, as regras do quadro e,
    // ao perguntar se desativa, quantos cards a coluna tem. Sem dubles, essas
    // leituras iam a rede de verdade e a tela ficava meio quebrada.
    projectReportService: { ...real.projectReportService, listReportCounts: dublê.contar },
    projectPublicStageService: {
      ...real.projectPublicStageService,
      listPublicStages: dublê.etapas,
    },
    projectStatusMappingService: {
      getStatusMapping: dublê.lerMapa,
      saveStatusMapping: dublê.salvarMapa,
    },
    projectCycleSettingsService: {
      getCycleSettings: dublê.lerRegras,
      saveCycleSettings: dublê.salvarRegras,
    },
  }
})

function etapa(publicId: string, label: string, position: number): ProjectPublicStageViewModel {
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
  }
}

const ETAPAS = [
  etapa('e-1', 'Recebido', 0),
  etapa('e-2', 'Em desenvolvimento', 1),
  etapa('e-3', 'Concluído', 2),
]

/** O mapa, a partir de pares coluna → etapa. */
function mapa(versao: number, pares: Array<[string, string]>): ProjectStatusMappingViewModel {
  return {
    Version: versao,
    Entries: pares.map(([coluna, etapaId]) => ({
      StatePublicId: coluna,
      StateName: coluna,
      StateIsActive: true,
      StagePublicId: etapaId,
      StageLabel: ETAPAS.find((item) => item.PublicId === etapaId)?.Label ?? null,
    })),
    UnmappedCount: 0,
  }
}

function contagem(statePublicId: string, total: number): ReportStateCountViewModel {
  return {
    StatePublicId: statePublicId,
    StateName: statePublicId,
    IsActive: true,
    ClosesReport: false,
    Total: total,
  }
}

/** As regras do ciclo de fabrica, com o que nao e desta tela fora do padrao. */
const regras: CycleSettingsViewModel = {
  ClosureTrigger: 'Button',
  PublicDelayMinutes: 15,
  AllowsReopen: true,
  ReopenStatePublicId: null,
  ReopenRequiresComment: true,
  TrackingCodeCanAct: false,
  SatisfactionEnabled: true,
  SatisfactionStyle: 'Stars',
  SatisfactionRequired: false,
  InfoRequestEnabled: true,
  InfoRequestWarnDays: 7,
  InfoRequestCloseDays: 7,
  AcceptsQuestionsDefault: true,
  AllowsReportArchiving: false,
  LastColumnVisibleDays: 14,
  DueSoonDays: 2,
  SprintsEnabled: true,
  SprintLengthWeeks: 3,
}

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
  Account: { PublicId: 'conta-1', Name: 'Conta de teste' },
  Role: 'Administrator',
  IsAccountOwner: true,
  LastReportReceivedAt: null,
  LastActivityAt: null,
}

/**
 * Comeca o arrasto **com um `dataTransfer`**, que o jsdom nao cria.
 *
 * Sem ele, `onDragStart` estourava em `event.dataTransfer.effectAllowed` e o
 * vitest fechava a corrida com "2 errors" ao lado de "251 passed". As assercoes
 * nao dependiam disso — quem reordena e `onDragEnter` —, entao os testes passavam
 * e o erro parecia enfeite. Mas as duas linhas que falam com o navegador nunca
 * chegavam a rodar, e uma suite que termina com erro ensina a ignorar erro.
 */
function comecarArrasto(linha: HTMLElement) {
  fireEvent.dragStart(linha, {
    dataTransfer: { effectAllowed: 'none', setData: vi.fn() },
  })
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

/** Os nomes na ordem em que estao desenhados (com o selo "Desativada" colado). */
const nomesNaTela = () =>
  screen.getAllByRole('listitem').map((item) => item.textContent?.split('Editar')[0]?.trim())

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
    dublê.contar.mockResolvedValue([])
    dublê.etapas.mockResolvedValue(ETAPAS)
    dublê.lerMapa.mockResolvedValue(mapa(1, []))
    dublê.lerRegras.mockResolvedValue(regras)
    useToastStore.setState({ toasts: [] })
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

  it('desativar mantém a coluna na lista, marcada', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'Análise', 0), estado('s-2', 'Pronto', 1)])
    dublê.aposentar.mockResolvedValue(estado('s-2', 'Pronto', 1, false))

    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar Pronto' }))
    // O botao do dialogo e o unico chamado so "Desativar": os da lista trazem o
    // nome da coluna junto.
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar', hidden: true }))

    await waitFor(() => expect(dublê.aposentar).toHaveBeenCalledWith('p-1', 's-2'))
    // Continua na lista, no lugar onde estava.
    await waitFor(() => expect(nomesNaTela()).toEqual(['Análise', 'ProntoDesativada']))
    expect(screen.getByRole('button', { name: 'Reativar Pronto' })).toBeTruthy()
  })

  it('a pergunta de desativar diz quantos cards estão na coluna', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0), estado('s-2', 'Fazendo', 1)])
    dublê.contar.mockResolvedValue([contagem('s-1', 2), contagem('s-2', 5)])

    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar A fazer' }))

    const dialogo = await screen.findByRole('alertdialog')
    expect(
      await within(dialogo).findByText(/“A fazer” tem 2 cards\. Eles continuam nela/),
    ).toBeTruthy()
    // Perguntar nao desativa: so o botao do dialogo.
    expect(dublê.aposentar).not.toHaveBeenCalled()
  })

  it('sem conseguir contar, a pergunta continua — só sem o número', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0), estado('s-2', 'Fazendo', 1)])
    dublê.contar.mockRejectedValue(new Error('rede'))

    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar A fazer' }))

    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText(/Ela sai do quadro e deixa de receber card novo/)).toBeTruthy()
    expect(within(dialogo).getByRole('button', { name: 'Desativar' })).toBeTruthy()
  })

  it('mostra o nome que a API devolveu, e não o que foi digitado', async () => {
    dublê.listar.mockResolvedValue([])
    dublê.criar.mockResolvedValue(estado('s-1', 'Em análise', 0))

    montar()

    const campo = await screen.findByRole('textbox', { name: 'Nova coluna' })
    fireEvent.change(campo, { target: { value: '  Em   análise  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar coluna' }))

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
    comecarArrasto(primeira)
    fireEvent.dragEnter(terceira)

    // A lista se reorganiza com o dedo em cima, e não só ao soltar.
    await waitFor(() => expect(nomesNaTela()).toEqual(['ParadoDesativada', 'Pronto', 'Análise']))
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
    comecarArrasto(primeira)
    fireEvent.drop(primeira)

    // Pegar e largar no mesmo lugar é desistir, e desistir não é uma gravação.
    await waitFor(() => expect(nomesNaTela()).toEqual(['Análise', 'Pronto']))
    expect(dublê.reordenar).not.toHaveBeenCalled()
  })

  it('cada coluna diz o que quem relatou vê, e trocar grava o mapa inteiro', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0), estado('s-2', 'Feito', 1)])
    dublê.lerMapa.mockResolvedValue(
      mapa(1, [
        ['s-1', 'e-1'],
        ['s-2', 'e-3'],
      ]),
    )
    dublê.salvarMapa.mockResolvedValue(
      mapa(2, [
        ['s-1', 'e-2'],
        ['s-2', 'e-3'],
      ]),
    )

    montar()
    const escolha = await screen.findByRole('combobox', {
      name: 'O que quem relatou vê com o relato em A fazer',
    })
    expect(escolha.textContent).toContain('Recebido')

    await escolherNoSelect(
      screen,
      fireEvent,
      'O que quem relatou vê com o relato em A fazer',
      'Em desenvolvimento',
    )

    // Uma versao por escolha, com o conjunto inteiro — e nao so a linha que mudou.
    await waitFor(() => expect(dublê.salvarMapa).toHaveBeenCalledTimes(1))
    expect(dublê.salvarMapa.mock.calls[0]?.[1]).toEqual({
      Entries: [
        { StatePublicId: 's-2', StagePublicId: 'e-3' },
        { StatePublicId: 's-1', StagePublicId: 'e-2' },
      ],
    })
  })

  it('"nada muda para quem relatou" tira a coluna do mapa, em vez de gravar uma ligação vazia', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0), estado('s-2', 'Feito', 1)])
    dublê.lerMapa.mockResolvedValue(
      mapa(1, [
        ['s-1', 'e-1'],
        ['s-2', 'e-3'],
      ]),
    )
    dublê.salvarMapa.mockResolvedValue(mapa(2, [['s-2', 'e-3']]))

    montar()
    await screen.findByRole('combobox', { name: 'O que quem relatou vê com o relato em A fazer' })
    await escolherNoSelect(
      screen,
      fireEvent,
      'O que quem relatou vê com o relato em A fazer',
      'Nada muda para quem relatou',
    )

    await waitFor(() => expect(dublê.salvarMapa).toHaveBeenCalledTimes(1))
    expect(dublê.salvarMapa.mock.calls[0]?.[1]).toEqual({
      Entries: [{ StatePublicId: 's-2', StagePublicId: 'e-3' }],
    })
  })

  it('a coluna nova nasce ligada à etapa da última coluna ativa de antes, e o aviso diz qual', async () => {
    dublê.listar.mockResolvedValue([
      estado('s-1', 'A fazer', 0),
      estado('s-2', 'Feito', 1),
      // Desativada no fim: nao conta como vizinha — nenhum relato novo entra nela.
      estado('s-3', 'Arquivo', 2, false),
    ])
    dublê.lerMapa.mockResolvedValue(
      mapa(1, [
        ['s-1', 'e-1'],
        ['s-2', 'e-3'],
        ['s-3', 'e-2'],
      ]),
    )
    dublê.criar.mockResolvedValue(estado('s-4', 'Revisão', 3))
    dublê.salvarMapa.mockResolvedValue(
      mapa(2, [
        ['s-1', 'e-1'],
        ['s-2', 'e-3'],
        ['s-3', 'e-2'],
        ['s-4', 'e-3'],
      ]),
    )

    montar()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nova coluna' }), {
      target: { value: 'Revisão' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar coluna' }))

    await waitFor(() => expect(dublê.salvarMapa).toHaveBeenCalledTimes(1))
    expect(dublê.salvarMapa.mock.calls[0]?.[1]).toEqual({
      Entries: [
        { StatePublicId: 's-1', StagePublicId: 'e-1' },
        { StatePublicId: 's-2', StagePublicId: 'e-3' },
        { StatePublicId: 's-3', StagePublicId: 'e-2' },
        { StatePublicId: 's-4', StagePublicId: 'e-3' },
      ],
    })
    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((item) => item.message)).toContain(
        'Coluna criada. Nela, quem relatou vê “Concluído”.',
      ),
    )
  })

  it('as regras do quadro só mostram a barra com mudança, e voltam com o resto do ciclo intacto', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0)])
    dublê.salvarRegras.mockResolvedValue({ ...regras, LastColumnVisibleDays: 0, DueSoonDays: 5 })

    montar()

    const dias = await screen.findByLabelText(/A última coluna mostra o que entrou nela/)
    expect((dias as HTMLInputElement).value).toBe('14')
    expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).toBeNull()

    // Zero na ultima coluna e "mostrar todos" — e nao vira um, como nos prazos.
    fireEvent.change(dias, { target: { value: '0' } })
    expect((dias as HTMLInputElement).value).toBe('0')
    expect(screen.getByText(/Zero: mostra todos/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/O prazo fica em destaque faltando/), {
      target: { value: '5' },
    })
    const barra = screen.getByRole('region', { name: 'Alterações não salvas' })
    fireEvent.click(within(barra).getByRole('button', { name: 'Salvar' }))

    // **O ponto do teste.** O registro e um so com o Ciclo e as Sprints: o pedido
    // leva o que foi lido, com so os dois campos daqui mudados.
    await waitFor(() =>
      expect(dublê.salvarRegras).toHaveBeenCalledWith('p-1', {
        ...regras,
        LastColumnVisibleDays: 0,
        DueSoonDays: 5,
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).toBeNull(),
    )
  })

  it('descartar as regras do quadro volta ao que está salvo, sem gravar', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0)])

    montar()
    const destaque = await screen.findByLabelText(/O prazo fica em destaque faltando/)
    fireEvent.change(destaque, { target: { value: '9' } })

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))

    expect((destaque as HTMLInputElement).value).toBe('2')
    expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).toBeNull()
    expect(dublê.salvarRegras).not.toHaveBeenCalled()
  })

  it('sem as regras do ciclo, a seção do quadro some e as colunas continuam', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0)])
    dublê.lerRegras.mockRejectedValue(new Error('rede'))

    montar()
    expect(await screen.findByText('A fazer')).toBeTruthy()
    expect(screen.queryByText('Como o quadro mostra o fim e os prazos')).toBeNull()
    expect(screen.getByRole('button', { name: 'Criar coluna' })).toBeTruthy()
  })
})
