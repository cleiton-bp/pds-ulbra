// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CycleSettingsViewModel,
  ProjectPublicStageViewModel,
  ProjectReportTypeViewModel,
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
 * **Cada coluna diz o que quem relatou ve**, e o Salvar da coluna grava o mapa
 * inteiro (cada gravacao e uma versao, o retrato do conjunto) — **so quando a etapa
 * mudou**: renomear nao pode criar versao. A coluna nova nasce ligada a etapa da
 * ultima coluna ativa de antes — sem isso, quem relatou continuava lendo "Recebido"
 * com o relato ja na coluna nova, e ninguem percebia.
 *
 * **As marcas dizem o que a coluna faz**: a entrada de um tipo (a escolhida, ou a
 * primeira ativa para quem nao escolheu), a que encerra o relato pela regra do Ciclo, a
 * desativada. E a entrada de um tipo nao oferece Desativar: o caminho vem escrito.
 *
 * **As regras do quadro moram aqui, e voltam inteiras.** Sao campos do registro do
 * ciclo: o salvar daqui manda o que leu, com so os dois campos mudados — mandar so os
 * visiveis apagaria o encerramento e as sprints. E nelas zero quer dizer alguma
 * coisa ("mostra todos"), ao contrario dos prazos do Ciclo.
 *
 * **A previa e o rascunho**: o quadro de exemplo mostra o nome e a etapa da coluna
 * aberta como estao escritos, antes do Salvar.
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
  contar: vi.fn<() => Promise<ReportStateCountViewModel[]>>(),
  etapas: vi.fn<() => Promise<ProjectPublicStageViewModel[]>>(),
  lerMapa: vi.fn<() => Promise<ProjectStatusMappingViewModel>>(),
  salvarMapa: vi.fn(),
  lerRegras: vi.fn<() => Promise<CycleSettingsViewModel>>(),
  salvarRegras: vi.fn(),
  tipos: vi.fn<() => Promise<ProjectReportTypeViewModel[]>>(),
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
    projectReportTypeService: { ...real.projectReportTypeService, listReportTypes: dublê.tipos },
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

function tipo(
  publicId: string,
  name: string,
  initialState: string | null,
  isActive = true,
): ProjectReportTypeViewModel {
  return {
    PublicId: publicId,
    Name: name,
    Color: 'Gray',
    Icon: 'Other',
    Position: 0,
    IsActive: isActive,
    Questions: [],
    ShowsTextBox: true,
    TextBoxPrompt: null,
    InitialStatePublicId: initialState,
    CreatedAt: '2026-10-01T12:00:00.000Z',
  }
}

/** Os itens da lista de colunas — e nao os do quadro de exemplo, ao lado. */
const itens = () =>
  within(document.getElementById('colunas-no-andamento') as HTMLElement).getAllByRole('listitem')

/**
 * Os nomes na ordem em que estao desenhados. O `textContent` cru do nome, sem o
 * "Editar " que so o leitor de tela ouve.
 */
const nomesNaTela = () =>
  itens().map((item) => item.querySelector('summary .sr-only')?.nextElementSibling?.textContent)

/** O item da coluna, pelo nome que ele mostra. */
const item = (nome: string) => {
  const achado = itens().find(
    (li) => li.querySelector('summary .sr-only')?.nextElementSibling?.textContent === nome,
  )
  if (!achado) throw new Error(`sem a coluna ${nome}`)
  return achado
}

/** Abre (ou fecha) a coluna pelo cabecalho, como a pessoa faz. */
const abrir = (nome: string) => fireEvent.click(item(nome).querySelector('summary') as HTMLElement)

/** O quadro de exemplo, a direita. */
const quadro = () => screen.getByRole('list', { name: 'Quadro de exemplo' })

/** O grupo "Fim e prazos no quadro". */
const grupoDasRegras = () => screen.getByRole('region', { name: 'Fim e prazos no quadro' })

// A caixa de escolha do produto desenha a propria lista, e o jsdom nao tem o
// que ela usa para abrir. Sem isto o teste falharia pelo ambiente, nao pelo codigo.
instalarRemendosDoRadix()

describe('ProjectStatesScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.contar.mockResolvedValue([])
    dublê.etapas.mockResolvedValue(ETAPAS)
    dublê.lerMapa.mockResolvedValue(mapa(1, []))
    dublê.lerRegras.mockResolvedValue(regras)
    dublê.tipos.mockResolvedValue([])
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
    // Continua na lista, no lugar onde estava, com a marca.
    await waitFor(() => expect(within(item('Pronto')).getByText('Desativada')).toBeTruthy())
    expect(nomesNaTela()).toEqual(['Análise', 'Pronto'])
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
    await screen.findByRole('button', { name: 'Mover Análise para baixo' })

    const linhas = itens()
    const primeira = linhas[0] as HTMLElement
    const terceira = linhas[2] as HTMLElement

    // A alça é o que liga o arrasto: sem ela a linha não é arrastável, para
    // selecionar o nome com o mouse não virar um arrasto.
    fireEvent.mouseDown(primeira.querySelector('button') as HTMLElement)
    comecarArrasto(primeira)
    fireEvent.dragEnter(terceira)

    // A lista se reorganiza com o dedo em cima, e não só ao soltar.
    await waitFor(() => expect(nomesNaTela()).toEqual(['Parado', 'Pronto', 'Análise']))
    expect(dublê.reordenar).not.toHaveBeenCalled()

    fireEvent.drop(terceira)

    // Uma gravação só, com a fila inteira e o aposentado dentro.
    await waitFor(() => expect(dublê.reordenar).toHaveBeenCalledTimes(1))
    expect(dublê.reordenar.mock.calls[0]?.[1]).toEqual({ Order: ['s-2', 's-3', 's-1'] })
  })

  it('soltar sem ter mudado de lugar não grava nada', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'Análise', 0), estado('s-2', 'Pronto', 1)])

    montar()
    await screen.findByRole('button', { name: 'Mover Análise para baixo' })

    const primeira = itens()[0] as HTMLElement
    fireEvent.mouseDown(primeira.querySelector('button') as HTMLElement)
    comecarArrasto(primeira)
    fireEvent.drop(primeira)

    // Pegar e largar no mesmo lugar é desistir, e desistir não é uma gravação.
    await waitFor(() => expect(nomesNaTela()).toEqual(['Análise', 'Pronto']))
    expect(dublê.reordenar).not.toHaveBeenCalled()
  })

  it('cada coluna diz o que quem relatou vê, e o Salvar grava o mapa inteiro', async () => {
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
    // Fechada, a coluna ja diz o que quem relatou ve.
    await waitFor(() => expect(item('A fazer').textContent).toContain('Quem relatou vê: Recebido'))

    abrir('A fazer')
    const escolha = screen.getByRole('combobox', {
      name: 'O que quem relatou vê com o relato em A fazer',
    })
    expect(escolha.textContent).toContain('Recebido')

    await escolherNoSelect(
      screen,
      fireEvent,
      'O que quem relatou vê com o relato em A fazer',
      'Em desenvolvimento',
    )
    // Escolher nao grava: e o Salvar da coluna.
    expect(dublê.salvarMapa).not.toHaveBeenCalled()
    fireEvent.click(within(item('A fazer')).getByRole('button', { name: 'Salvar' }))

    // Uma versao por decisao, com o conjunto inteiro — e nao so a linha que mudou.
    await waitFor(() => expect(dublê.salvarMapa).toHaveBeenCalledTimes(1))
    expect(dublê.salvarMapa.mock.calls[0]?.[1]).toEqual({
      Entries: [
        { StatePublicId: 's-2', StagePublicId: 'e-3' },
        { StatePublicId: 's-1', StagePublicId: 'e-2' },
      ],
    })
    // O nome nao mudou: nada de renomear.
    expect(dublê.renomear).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(item('A fazer').textContent).toContain('Quem relatou vê: Em desenvolvimento'),
    )
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
    await waitFor(() => expect(item('A fazer').textContent).toContain('Recebido'))
    abrir('A fazer')
    await escolherNoSelect(
      screen,
      fireEvent,
      'O que quem relatou vê com o relato em A fazer',
      'Nada muda para quem relatou',
    )
    fireEvent.click(within(item('A fazer')).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvarMapa).toHaveBeenCalledTimes(1))
    expect(dublê.salvarMapa.mock.calls[0]?.[1]).toEqual({
      Entries: [{ StatePublicId: 's-2', StagePublicId: 'e-3' }],
    })
  })

  it('renomear sem mexer na etapa não grava o mapa: renomear não cria versão', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0), estado('s-2', 'Feito', 1)])
    dublê.lerMapa.mockResolvedValue(mapa(1, [['s-1', 'e-1']]))
    dublê.renomear.mockResolvedValue(estado('s-1', 'Triagem', 0))

    montar()
    await waitFor(() => expect(item('A fazer').textContent).toContain('Recebido'))
    abrir('A fazer')
    fireEvent.change(screen.getByRole('textbox', { name: 'Novo nome para A fazer' }), {
      target: { value: 'Triagem' },
    })
    fireEvent.click(within(item('Triagem')).getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(dublê.renomear).toHaveBeenCalledWith('p-1', 's-1', { Name: 'Triagem' }),
    )
    // Fechou ao salvar, com o nome novo.
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /Novo nome/ })).toBeNull())
    expect(nomesNaTela()).toEqual(['Triagem', 'Feito'])
    expect(dublê.salvarMapa).not.toHaveBeenCalled()
  })

  it('o nome salvo e o mapa recusado: a mensagem diz o que ficou, e o próximo Salvar tenta só o mapa', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0)])
    dublê.lerMapa.mockResolvedValue(mapa(1, [['s-1', 'e-1']]))
    dublê.renomear.mockResolvedValue(estado('s-1', 'Triagem', 0))
    dublê.salvarMapa
      .mockRejectedValueOnce(new Error('sem rede'))
      .mockResolvedValueOnce(mapa(2, [['s-1', 'e-2']]))

    montar()
    await waitFor(() => expect(item('A fazer').textContent).toContain('Recebido'))
    abrir('A fazer')
    fireEvent.change(screen.getByRole('textbox', { name: 'Novo nome para A fazer' }), {
      target: { value: 'Triagem' },
    })
    await escolherNoSelect(
      screen,
      fireEvent,
      'O que quem relatou vê com o relato em A fazer',
      'Em desenvolvimento',
    )
    fireEvent.click(within(item('Triagem')).getByRole('button', { name: 'Salvar' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /O nome foi salvo, mas o que quem relatou vê não foi/,
    )
    // Continua aberta, com a etapa escolhida guardada.
    expect(dublê.renomear).toHaveBeenCalledTimes(1)

    fireEvent.click(within(item('Triagem')).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(dublê.salvarMapa).toHaveBeenCalledTimes(2))
    // O nome ja estava salvo: nao renomeia de novo.
    expect(dublê.renomear).toHaveBeenCalledTimes(1)
  })

  it('trocar de coluna com mudança por salvar pergunta antes', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0), estado('s-2', 'Feito', 1)])

    montar()
    await screen.findByRole('button', { name: 'Mover A fazer para baixo' })
    abrir('A fazer')
    fireEvent.change(screen.getByRole('textbox', { name: 'Novo nome para A fazer' }), {
      target: { value: 'Triagem' },
    })
    abrir('Feito')

    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('Descartar o que mudou em “A fazer”?')).toBeTruthy()
    // Ainda aberta, com o que foi escrito (atras do dialogo, por isso `hidden`).
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Novo nome para A fazer',
          hidden: true,
        }) as HTMLInputElement
      ).value,
    ).toBe('Triagem')
    expect(dublê.renomear).not.toHaveBeenCalled()
  })

  it('a prévia mostra a coluna aberta como está escrita, antes do Salvar', async () => {
    dublê.listar.mockResolvedValue([
      estado('s-1', 'A fazer', 0),
      estado('s-2', 'Feito', 1),
      estado('s-3', 'Arquivo', 2, false),
    ])
    dublê.lerMapa.mockResolvedValue(
      mapa(1, [
        ['s-1', 'e-1'],
        ['s-2', 'e-3'],
      ]),
    )

    montar()
    await waitFor(() => expect(quadro().textContent).toContain('Quem relatou vê: Recebido'))
    // So as ativas, na ordem, e o card de exemplo na primeira.
    const colunas = () =>
      within(quadro())
        .getAllByRole('heading')
        .map((titulo) => titulo.textContent)
    expect(colunas()).toEqual(['A fazer', 'Feito'])

    abrir('A fazer')
    fireEvent.change(screen.getByRole('textbox', { name: 'Novo nome para A fazer' }), {
      target: { value: 'Triagem' },
    })
    await escolherNoSelect(
      screen,
      fireEvent,
      'O que quem relatou vê com o relato em A fazer',
      'Em desenvolvimento',
    )

    expect(colunas()).toEqual(['Triagem', 'Feito'])
    const primeira = within(quadro()).getAllByRole('listitem')[0] as HTMLElement
    expect(primeira.textContent).toContain('Quem relatou vê: Em desenvolvimento')
    expect(screen.getByText('ainda não salvo')).toBeTruthy()
    expect(dublê.salvarMapa).not.toHaveBeenCalled()
    expect(dublê.renomear).not.toHaveBeenCalled()
  })

  it('marca a entrada de cada tipo, a coluna que encerra o relato e a desativada', async () => {
    dublê.listar.mockResolvedValue([
      estado('s-1', 'A fazer', 0),
      estado('s-2', 'Fazendo', 1),
      estado('s-3', 'Feito', 2),
      estado('s-4', 'Arquivo', 3, false),
    ])
    dublê.tipos.mockResolvedValue([
      // Sem escolha: entra na primeira coluna ativa.
      tipo('t-1', 'Defeito', null),
      tipo('t-2', 'Melhoria', 's-2'),
      tipo('t-3', 'Dúvida', 's-2'),
      // Desativado: nao entra em lugar nenhum agora, e nao marca.
      tipo('t-4', 'Antigo', 's-1', false),
    ])
    dublê.lerRegras.mockResolvedValue({ ...regras, ClosureTrigger: 'LastColumn' })

    montar()
    await waitFor(() => expect(within(item('A fazer')).getByText('Entrada: Defeito')).toBeTruthy())
    expect(within(item('Fazendo')).getByText('Entrada: Melhoria e Dúvida')).toBeTruthy()
    // A ultima ATIVA encerra: a desativada depois dela nao conta.
    expect(within(item('Feito')).getByText('Encerra o relato')).toBeTruthy()
    expect(within(item('Arquivo')).getByText('Desativada')).toBeTruthy()
    expect(within(item('Arquivo')).queryByText('Encerra o relato')).toBeNull()
    // O desativado nao marca a entrada (nao entra relato dele), mas ainda prende a coluna.
    expect(within(item('A fazer')).queryByText(/Entrada:.*Antigo/)).toBeNull()

    // No quadro de exemplo, as mesmas marcas.
    expect(within(quadro()).getByText('Encerra')).toBeTruthy()
    expect(within(quadro()).getByText('Entrada: Melhoria e Dúvida')).toBeTruthy()
  })

  it('com o encerramento por botão, nenhuma coluna encerra o relato', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0), estado('s-2', 'Feito', 1)])
    // `regras` encerra por botao.

    montar()
    await screen.findByRole('button', { name: 'Desativar Feito' })
    await waitFor(() => expect(dublê.lerRegras).toHaveBeenCalled())
    expect(screen.queryByText('Encerra o relato')).toBeNull()
  })

  it('a entrada de um tipo não oferece Desativar, e diz onde trocar', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0), estado('s-2', 'Fazendo', 1)])
    dublê.tipos.mockResolvedValue([
      tipo('t-1', 'Defeito', null),
      // Desativado tambem prende, como na API: reativa-lo traria o problema de volta.
      tipo('t-2', 'Antigo', 's-2', false),
    ])

    montar()
    const desativar = await screen.findByRole('button', { name: 'Desativar Fazendo' })
    await waitFor(() => expect((desativar as HTMLButtonElement).disabled).toBe(true))
    const porque = within(item('Fazendo')).getByText(/É a entrada de Antigo/)
    expect(porque.textContent).toContain('troque em Tipos de relato')
    expect(within(porque).getByRole('link', { name: 'Tipos de relato' })).toBeTruthy()
    expect(desativar.getAttribute('aria-describedby')).toBe(porque.id)

    // A primeira ativa, entrada de quem nao escolheu, desativa: a entrada so passa adiante.
    expect(
      (screen.getByRole('button', { name: 'Desativar A fazer' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('a recusa da API ao desativar (a corrida) ainda vira aviso', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0), estado('s-2', 'Fazendo', 1)])
    dublê.aposentar.mockRejectedValue(new Error('Esta coluna é a entrada de um tipo.'))

    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar Fazendo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar', hidden: true }))

    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((aviso) => aviso.tone === 'danger')).toBe(true),
    )
    expect(within(item('Fazendo')).queryByText('Desativada')).toBeNull()
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
    await waitFor(() => expect(item('A fazer').textContent).toContain('Recebido'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nova coluna' }), {
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

  it('as regras do quadro gravam no Salvar do grupo, e voltam com o resto do ciclo intacto', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0)])
    dublê.salvarRegras.mockResolvedValue({ ...regras, LastColumnVisibleDays: 0, DueSoonDays: 5 })

    montar()

    // Fechado, o grupo diz o valor; sem mudanca do padrao, nada de "Mudou".
    const grupo = await waitFor(grupoDasRegras)
    const resumo = () => grupo.querySelector('summary')?.textContent ?? ''
    expect(resumo()).toContain('Última coluna: 14 dias · Prazo: 2 dias')
    expect(resumo()).not.toContain('Mudou')
    // O endereco antigo do "Mais opções" continua levando ate aqui.
    expect(document.getElementById('mais-opcoes')?.contains(grupo)).toBe(true)
    // Sem "Alterar": os campos ja estao no grupo.
    expect(screen.queryByRole('button', { name: 'Alterar' })).toBeNull()

    const dias = within(grupo).getByLabelText(/A última coluna mostra o que entrou nela/)
    expect((dias as HTMLInputElement).value).toBe('14')
    expect(dias.id).toBe('ultima-coluna')

    // Zero na ultima coluna e "mostrar todos" — e nao vira um, como nos prazos.
    fireEvent.change(dias, { target: { value: '0' } })
    expect((dias as HTMLInputElement).value).toBe('0')
    expect(within(grupo).getByText(/Zero: mostra todos/)).toBeTruthy()

    const prazo = within(grupo).getByLabelText(/O prazo fica em destaque faltando/)
    expect(prazo.id).toBe('prazo-perto')
    fireEvent.change(prazo, { target: { value: '5' } })
    expect(resumo()).toContain('não salvo')
    fireEvent.click(within(grupo).getByRole('button', { name: 'Salvar' }))

    // **O ponto do teste.** O registro e um so com o Ciclo e as Sprints: o pedido
    // leva o que esta salvo agora, com so os dois campos daqui mudados.
    await waitFor(() =>
      expect(dublê.salvarRegras).toHaveBeenCalledWith('p-1', {
        ...regras,
        LastColumnVisibleDays: 0,
        DueSoonDays: 5,
      }),
    )
    // Gravou: o resumo diz o valor e o que saiu do padrao.
    await waitFor(() => expect(resumo()).not.toContain('não salvo'))
    expect(resumo()).toContain('Última coluna: todos · Prazo: 5 dias')
    expect(resumo()).toContain('Mudou: Dias da última coluna, Destaque do prazo')
  })

  it('cancelar as regras do quadro volta ao que está salvo, sem gravar', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0)])

    montar()
    const grupo = await waitFor(grupoDasRegras)
    const destaque = within(grupo).getByLabelText(/O prazo fica em destaque faltando/)
    fireEvent.change(destaque, { target: { value: '9' } })

    fireEvent.click(within(grupo).getByRole('button', { name: 'Cancelar' }))

    expect((destaque as HTMLInputElement).value).toBe('2')
    expect(grupo.querySelector('summary')?.textContent).toContain('Prazo: 2 dias')
    expect(dublê.salvarRegras).not.toHaveBeenCalled()
  })

  it('"Voltar ao padrão" põe os de fábrica no grupo, e é o Salvar que grava', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0)])
    dublê.lerRegras.mockResolvedValue({ ...regras, LastColumnVisibleDays: 30 })
    dublê.salvarRegras.mockImplementation(
      async (_id: string, pedido: CycleSettingsViewModel) => pedido,
    )

    montar()
    const grupo = await waitFor(grupoDasRegras)
    expect(grupo.querySelector('summary')?.textContent).toContain('Mudou: Dias da última coluna')

    fireEvent.click(within(grupo).getByRole('button', { name: 'Voltar ao padrão' }))
    expect((within(grupo).getByLabelText(/A última coluna mostra/) as HTMLInputElement).value).toBe(
      '14',
    )
    // O grupo abre, para o Salvar estar a vista.
    expect(grupo.querySelector('details')?.open).toBe(true)
    expect(dublê.salvarRegras).not.toHaveBeenCalled()

    fireEvent.click(within(grupo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(dublê.salvarRegras).toHaveBeenCalledWith('p-1', {
        ...regras,
        LastColumnVisibleDays: 14,
      }),
    )
  })

  it('sem as regras do ciclo, o grupo do quadro some e as colunas continuam', async () => {
    dublê.listar.mockResolvedValue([estado('s-1', 'A fazer', 0)])
    dublê.lerRegras.mockRejectedValue(new Error('rede'))

    montar()
    await screen.findByRole('button', { name: 'Desativar A fazer' })
    await waitFor(() => expect(dublê.lerRegras).toHaveBeenCalled())
    expect(document.getElementById('fim-e-prazos')).toBeNull()
    expect(screen.getByRole('button', { name: 'Criar coluna' })).toBeTruthy()
  })
})
