// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummaryViewModel, SprintViewModel } from '@/contracts'
import { NO_REPORT_FILTERS } from '@/data'
import { PanelError } from '@/data/errors'
import { CardFields } from '@/features/reports/CardFields'
import { ReportHistory } from '@/features/reports/ReportHistory'
import { SprintBacklog } from '@/features/reports/sprints/SprintBacklog'
import {
  addDays,
  CloseSprintDialog,
  daysLeft,
  NoActiveSprint,
  SprintBar,
  SprintDialog,
  SprintsFailed,
  sprintDates,
  timeLeftText,
  todayIso,
  useSprintsForFilter,
} from '@/features/reports/sprints/sprintLook'
import { useToastStore } from '@/shared/components/toastStore'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

instalarRemendosDoRadix()

/**
 * O QUE ESTES TESTES TRAVAM: as sprints no painel.
 *
 * - **O prazo da sprint pelo dia de quem olha**, e a barra do quadro com o que falta. As
 *   datas sem repetir o mes nem o ano: o ano so quando nao e o de agora (S-17).
 * - **O dia que vai a API e o de quem usa** (`Today`), e nao o de Greenwich: a noite, no
 *   Brasil, o UTC ja esta no dia seguinte (S-15). Criar, iniciar e concluir levam.
 * - **Iniciar comeca hoje, com a duracao do projeto** (S-01); as datas planejadas ficam a
 *   um clique; mudar o comeco leva o fim junto ate a pessoa mexer no fim; o fim antes do
 *   comeco e barrado no proprio dialogo.
 * - **Concluir manda o destino** do que nao terminou: o backlog, uma planejada, uma nova
 *   — **de saida, a primeira planejada** (S-16); "Ver os N" mostra quais; a frase nao fala
 *   de pontos sem estimativa; concluida, o aviso oferece iniciar a proxima.
 * - **O backlog**: as sprints em cima, o backlog embaixo, cada um com os seus cards; o
 *   menu do card move para outra lista (no fim) ou para o topo; iniciar fica fechado
 *   com outra em andamento, e diz qual; criar sprint; apagar diz o que acontece.
 * - **Planejar sem abrir card** (S-04, S-05): a linha mostra a prioridade e o prazo so
 *   quando perto ou vencido, e os pontos se estimam ali — Enter grava, o invalido mostra
 *   a regra, Esc desiste.
 * - **A busca do backlog vai a API** (S-06), na ordem do backlog, com "Meus cards".
 * - **Mover pelo menu avisa e desfaz** (S-07), e o foco fica na linha seguinte.
 * - **Cada lista se recolhe** e fica recolhida neste navegador (S-22); o primeiro uso
 *   ensina o caminho (S-13); a falha diz e tenta de novo (S-14); o rodape compara com o
 *   que a leitura trouxe (S-20).
 * - **O filtro "Sprint" da lista le as concluidas a parte** (decisao 83), so ligado, e
 *   rele quando as abertas mudam.
 * - **Os campos do card**: a sprint e os pontos so com a sprint ligada; pontos de meio em
 *   meio, com virgula; a subtarefa vai com o pai e nao leva pontos; a sprint concluida
 *   de um card que terminou so se le (S-03); o estado da sprint vai na dica (S-19).
 * - **O historico** conta a sprint e a estimativa.
 */
const dublê = vi.hoisted(() => ({
  listarSprints: vi.fn(),
  criarSprint: vi.fn(),
  fecharSprint: vi.fn(),
  iniciarSprint: vi.fn(),
  editarSprint: vi.fn(),
  apagarSprint: vi.fn(),
  listar: vi.fn(),
  planejar: vi.fn(),
  pontos: vi.fn(),
  historico: vi.fn(),
  membros: vi.fn(),
  prioridades: vi.fn(),
  etiquetas: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    sprintService: {
      listSprints: dublê.listarSprints,
      createSprint: dublê.criarSprint,
      closeSprint: dublê.fecharSprint,
      startSprint: dublê.iniciarSprint,
      updateSprint: dublê.editarSprint,
      deleteSprint: dublê.apagarSprint,
    },
    projectReportService: {
      listReports: dublê.listar,
      setSprint: dublê.planejar,
      setPoints: dublê.pontos,
      listReportHistory: dublê.historico,
    },
    projectTeamService: { listMembers: dublê.membros },
    projectPriorityService: { listPriorities: dublê.prioridades },
    projectLabelService: { listLabels: dublê.etiquetas, addLabel: vi.fn() },
  }
})

function sprint(extra: Partial<SprintViewModel> = {}): SprintViewModel {
  return {
    PublicId: 's-1',
    Number: 1,
    Name: 'Sprint 1',
    Goal: null,
    State: 'Active',
    StartsOn: '2026-10-05',
    EndsOn: '2026-10-18',
    StartedAt: '2026-10-05T12:00:00.000Z',
    ClosedAt: null,
    Cards: 4,
    DoneCards: 1,
    Points: 13,
    DonePoints: 2.5,
    ...extra,
  }
}

function card(extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: 'c-1',
    Kind: 'Team',
    Number: 10,
    Title: 'Trocar o gateway',
    ReporterTitle: null,
    TrackingCode: null,
    Type: null,
    Text: null,
    Route: null,
    Origin: null,
    StatePublicId: null,
    StateName: null,
    PublicStageLabel: null,
    AcceptsQuestions: null,
    PublicStageDueAt: null,
    ArchivedAt: null,
    CreatedAt: '2026-10-03T12:00:00.000Z',
    UpdatedAt: '2026-10-03T12:00:00.000Z',
    Assignee: null,
    Priority: null,
    Labels: [],
    DueDate: null,
    CommentCount: 0,
    AttachmentCount: 0,
    Closed: false,
    ClosureConfirmed: false,
    Finished: false,
    Parent: null,
    SubtaskCount: 0,
    SubtasksDone: 0,
    BlockedBy: [],
    DuplicateOf: null,
    DuplicateReporters: 0,
    Sprint: null,
    StoryPoints: null,
    ...extra,
  }
}

afterEach(() => {
  cleanup()
  // Os testes que fixam o dia de hoje fingem so o `Date`: o resto do relogio e o de verdade.
  vi.useRealTimers()
})
beforeEach(() => {
  for (const dublé of Object.values(dublê)) dublé.mockReset()
  useToastStore.setState({ toasts: [] })
  // As listas recolhidas ficam neste navegador: passariam de um teste para o outro.
  window.localStorage.clear()
})

/** O ultimo aviso da tela. */
const ultimoAviso = () => useToastStore.getState().toasts.at(-1)

/** Fixa o dia de quem usa (so o `Date`: o resto do relogio e o de verdade). */
function hojeE(dia: Date) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(dia)
}

/** Abre um menu ou uma caixa de escolha do Radix: ele abre no `pointerdown`. */
function apertar(gatilho: HTMLElement) {
  fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false, pointerType: 'mouse' })
}

describe('o prazo e a barra da sprint', () => {
  it('conta os dias pelo dia de quem olha', () => {
    const hoje = new Date(2026, 9, 10, 23, 30)
    expect(daysLeft('2026-10-18', hoje)).toBe(8)
    expect(daysLeft('2026-10-10', hoje)).toBe(0)
    expect(daysLeft('2026-10-08', hoje)).toBe(-2)
    expect(timeLeftText('2999-01-01')).toMatch(/^faltam \d+ dias$/)
  })

  it('a barra do quadro diz o nome, o que terminou e oferece concluir', () => {
    const aoConcluir = vi.fn()
    render(<SprintBar sprint={sprint({ Goal: 'Fechar o checkout' })} aoConcluir={aoConcluir} />)
    const barra = screen.getByRole('region', { name: 'Sprint em andamento: Sprint 1' })
    expect(barra.textContent).toContain('1 de 4 cards')
    expect(barra.textContent).toContain('2,5 de 13 pontos')
    expect(barra.textContent).toContain('Fechar o checkout')
    fireEvent.click(within(barra).getByRole('button', { name: 'Concluir sprint' }))
    expect(aoConcluir).toHaveBeenCalled()
  })

  it('concluir manda o destino escolhido — uma planejada que nao e a de padrao — e o dia de quem conclui', async () => {
    // 23h30 do dia 10 no relogio de quem usa: em UTC ja e o dia 11 (S-15).
    hojeE(new Date(2026, 9, 10, 23, 30))
    dublê.fecharSprint.mockResolvedValue({
      Sprint: sprint({ State: 'Closed' }),
      Moved: 3,
      Destination: sprint({ PublicId: 's-3', Name: 'Sprint 3', State: 'Planned' }),
    })
    const aoFechar = vi.fn()
    render(
      <CloseSprintDialog
        projectPublicId="p-1"
        sprint={sprint()}
        planejadas={[
          sprint({ PublicId: 's-2', Name: 'Sprint 2', State: 'Planned' }),
          sprint({ PublicId: 's-3', Name: 'Sprint 3', State: 'Planned' }),
        ]}
        aoFechar={aoFechar}
        aoCancelar={vi.fn()}
      />,
    )
    expect(screen.getByText(/1 de 4 cards terminaram/)).toBeTruthy()
    fireEvent.pointerDown(
      screen.getByRole('combobox', { name: /Os 3 que não terminaram vão para/ }),
      {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      },
    )
    fireEvent.click(await screen.findByRole('option', { name: 'Sprint 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Concluir sprint' }))
    await waitFor(() =>
      expect(dublê.fecharSprint).toHaveBeenCalledWith('p-1', 's-1', {
        Destination: 'Sprint',
        SprintPublicId: 's-3',
        Today: '2026-10-10',
      }),
    )
    expect(aoFechar).toHaveBeenCalled()
  })
})

describe('o backlog', () => {
  const ativa = sprint()
  const planejada = sprint({
    PublicId: 's-2',
    Number: 2,
    Name: 'Sprint 2',
    State: 'Planned',
    Cards: 0,
    Points: 0,
  })

  function montar(sprints = [ativa, planejada], aoMudou = vi.fn()) {
    dublê.listar.mockImplementation(async (_p, _pagina, _estado, _arquivo, opcoes) => ({
      reports:
        opcoes.sprint === 's-1'
          ? [card({ PublicId: 'c-1', Number: 10, StoryPoints: 3 })]
          : opcoes.sprint === 'backlog'
            ? [card({ PublicId: 'c-2', Number: 11, Title: 'Rever o texto' })]
            : [],
      total: opcoes.sprint === 'backlog' || opcoes.sprint === 's-1' ? 1 : 0,
    }))
    render(
      <MemoryRouter>
        <SprintBacklog
          projectPublicId="p-1"
          sprints={sprints}
          colunas={null}
          versao={0}
          aoMudou={aoMudou}
          soonDays={2}
        />
      </MemoryRouter>,
    )
    return aoMudou
  }

  it('as sprints em cima e o backlog embaixo, cada um com os seus cards, na ordem do time', async () => {
    montar()
    const secoes = await screen.findAllByRole('region')
    expect(
      secoes.map((secao) => within(secao).getByRole('heading', { level: 3 }).textContent),
    ).toEqual([expect.stringContaining('Sprint 1'), expect.stringContaining('Sprint 2'), 'Backlog'])
    expect(
      within(secoes[0] as HTMLElement).getByRole('link', { name: 'Trocar o gateway' }),
    ).toBeTruthy()
    expect(
      within(secoes[2] as HTMLElement).getByRole('link', { name: 'Rever o texto' }),
    ).toBeTruthy()
    expect(dublê.listar).toHaveBeenCalledWith('p-1', 1, null, false, {
      order: 'backlog',
      pageSize: 100,
      sprint: 'backlog',
    })
    // Com uma em andamento, a planejada nao inicia — e diz por que, escrito, com o nome
    // da que esta no caminho (S-21).
    expect(
      within(secoes[1] as HTMLElement).queryByRole('button', { name: 'Iniciar sprint' }),
    ).toBeNull()
    expect(
      within(secoes[1] as HTMLElement).getByText('Dá para iniciar quando a Sprint 1 for concluída'),
    ).toBeTruthy()
  })

  it('o menu do card leva para outra lista, no fim — e para o topo da propria', async () => {
    dublê.planejar.mockResolvedValue(
      card({ PublicId: 'c-2', Sprint: { PublicId: 's-2', Name: 'Sprint 2', State: 'Planned' } }),
    )
    const aoMudou = montar()
    await screen.findByRole('link', { name: 'Rever o texto' })

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mover #11 para…' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mover para Sprint 2' }))
    await waitFor(() =>
      expect(dublê.planejar).toHaveBeenCalledWith('p-1', 'c-2', {
        SprintPublicId: 's-2',
        AfterPublicId: null,
        Top: false,
      }),
    )
    await waitFor(() => expect(aoMudou).toHaveBeenCalled())

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mover #10 para…' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    // "desta lista": o topo da lista em que o card esta, e nao o de outra (S-21).
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Para o topo desta lista' }))
    await waitFor(() =>
      expect(dublê.planejar).toHaveBeenCalledWith('p-1', 'c-1', {
        SprintPublicId: 's-1',
        AfterPublicId: null,
        Top: true,
      }),
    )
  })

  it('"Criar sprint" cria uma planejada de fábrica, com o dia de quem cria', async () => {
    // 22h30 do dia 8 no relogio de quem usa: em UTC ja e o dia 9 (S-15). Nada alem do
    // dia vai no pedido: o nome, as datas e a duracao sao os de fabrica, da API.
    hojeE(new Date(2026, 9, 8, 22, 30))
    dublê.criarSprint.mockResolvedValue(
      sprint({ PublicId: 's-3', Name: 'Sprint 3', State: 'Planned' }),
    )
    const aoMudou = montar([planejada])
    fireEvent.click(await screen.findByRole('button', { name: 'Criar sprint' }))
    await waitFor(() =>
      expect(dublê.criarSprint).toHaveBeenCalledWith('p-1', { Today: '2026-10-08' }),
    )
    await waitFor(() => expect(aoMudou).toHaveBeenCalled())
    // Sem nenhuma em andamento, a planejada inicia.
    expect(
      (screen.getByRole('button', { name: 'Iniciar sprint' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})

describe('a sprint e os pontos no card aberto', () => {
  beforeEach(() => {
    dublê.membros.mockResolvedValue([])
    dublê.prioridades.mockResolvedValue([])
    dublê.etiquetas.mockResolvedValue([])
  })

  it('sem sprint ligada, os dois campos nem aparecem', () => {
    render(
      <CardFields projectPublicId="p-1" reportPublicId="c-1" card={card()} aoMudar={vi.fn()} />,
    )
    expect(screen.queryByRole('combobox', { name: 'Sprint' })).toBeNull()
    // Sem estimativa, o campo se chama "Pontos (sem estimativa)": o nome so comeca igual.
    expect(screen.queryByRole('textbox', { name: /^Pontos/ })).toBeNull()
  })

  it('com a sprint ligada: escolher a sprint, e os pontos de meio em meio, com vírgula', async () => {
    dublê.planejar.mockResolvedValue({
      ...card({ Sprint: { PublicId: 's-1', Name: 'Sprint 1', State: 'Active' } }),
      Description: null,
    })
    dublê.pontos.mockResolvedValue({ ...card({ StoryPoints: 2.5 }), Description: null })
    render(
      <CardFields
        projectPublicId="p-1"
        reportPublicId="c-1"
        card={card()}
        aoMudar={vi.fn()}
        sprints={[sprint()]}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Sprint' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    // Na lista aberta, a em andamento se distingue pelo "· em andamento" (S-19): entre
    // parenteses, o nome nao cabia no campo e saia cortado.
    fireEvent.click(await screen.findByRole('option', { name: 'Sprint 1 · em andamento' }))
    await waitFor(() =>
      expect(dublê.planejar).toHaveBeenCalledWith('p-1', 'c-1', { SprintPublicId: 's-1' }),
    )

    // O campo vazio diz ao leitor de tela que nao ha estimativa (S-19).
    const pontos = screen.getByRole('textbox', { name: 'Pontos (sem estimativa)' })
    fireEvent.change(pontos, { target: { value: '0,3' } })
    fireEvent.blur(pontos)
    expect(dublê.pontos).not.toHaveBeenCalled()
    fireEvent.change(pontos, { target: { value: '2,5' } })
    fireEvent.keyDown(pontos, { key: 'Enter' })
    await waitFor(() => expect(dublê.pontos).toHaveBeenCalledWith('p-1', 'c-1', { Points: 2.5 }))
  })

  it('a subtarefa vai com o pai: a sprint só se lê, e sem pontos', () => {
    render(
      <CardFields
        projectPublicId="p-1"
        reportPublicId="c-1"
        card={card({
          Parent: { PublicId: 'pai', Number: 9, Headline: 'Pai' },
          Sprint: { PublicId: 's-1', Name: 'Sprint 1', State: 'Active' },
        })}
        aoMudar={vi.fn()}
        sprints={[sprint()]}
      />,
    )
    expect(screen.getByText('Sprint 1')).toBeTruthy()
    expect(screen.getByText(/vai com o pai/)).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: /^Pontos/ })).toBeNull()
  })

  it('o card que terminou numa sprint concluida fica nela, so para ler — e nao vira "Backlog"', () => {
    const concluida = { PublicId: 's-0', Name: 'Sprint 0', State: 'Closed' as const }
    render(
      <CardFields
        projectPublicId="p-1"
        reportPublicId="c-1"
        card={card({ Finished: true, Sprint: concluida })}
        aoMudar={vi.fn()}
        sprints={[sprint()]}
      />,
    )
    // A escolha so tem as abertas: com ela, o card entregue na Sprint 0 parecia do backlog (S-03).
    expect(screen.getByText('Sprint 0 (concluída)')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Sprint' })).toBeNull()
  })

  it('reaberto, o card mostra a concluida como valor atual e da para leva-lo ao backlog', async () => {
    dublê.planejar.mockResolvedValue({ ...card(), Description: null })
    const concluida = { PublicId: 's-0', Name: 'Sprint 0', State: 'Closed' as const }
    render(
      <CardFields
        projectPublicId="p-1"
        reportPublicId="c-1"
        card={card({ Finished: false, Sprint: concluida })}
        aoMudar={vi.fn()}
        sprints={[sprint()]}
      />,
    )
    const campo = screen.getByRole('combobox', { name: 'Sprint' })
    expect(campo.textContent).toContain('Sprint 0 (concluída)')
    apertar(campo)
    expect(
      (await screen.findAllByRole('option')).map((opcao) => opcao.textContent?.trim()),
    ).toEqual(['Sprint 0 (concluída)', 'Backlog', 'Sprint 1 · em andamento'])
    fireEvent.click(screen.getByRole('option', { name: 'Backlog' }))
    await waitFor(() =>
      expect(dublê.planejar).toHaveBeenCalledWith('p-1', 'c-1', { SprintPublicId: null }),
    )
  })

  it('o estado da sprint escolhida vai na dica, embaixo, e nao cortado no nome', () => {
    const dicaDe = (campo: HTMLElement) =>
      document.getElementById(campo.getAttribute('aria-describedby') ?? '')?.textContent
    const { rerender } = render(
      <CardFields
        projectPublicId="p-1"
        reportPublicId="c-1"
        card={card({ Sprint: { PublicId: 's-1', Name: 'Sprint 1', State: 'Active' } })}
        aoMudar={vi.fn()}
        sprints={[sprint()]}
      />,
    )
    const campo = screen.getByRole('combobox', { name: 'Sprint' })
    // O campo mostra so o nome (S-19): "Sprint 1 (em andamento)" saia cortado.
    expect(campo.textContent?.trim()).toBe('Sprint 1')
    expect(dicaDe(campo)).toBe('Em andamento: está no quadro.')

    rerender(
      <CardFields
        projectPublicId="p-1"
        reportPublicId="c-1"
        card={card({ Sprint: { PublicId: 's-2', Name: 'Sprint 2', State: 'Planned' } })}
        aoMudar={vi.fn()}
        sprints={[sprint(), sprint({ PublicId: 's-2', Name: 'Sprint 2', State: 'Planned' })]}
      />,
    )
    expect(dicaDe(screen.getByRole('combobox', { name: 'Sprint' }))).toBe('Planejada.')
  })
})

describe('o histórico', () => {
  it('conta a sprint e a estimativa', async () => {
    const linha = (
      PublicId: string,
      Type: 'CardSprintChanged' | 'CardPointsChanged',
      From: string | null,
      To: string | null,
    ) => ({
      PublicId,
      Type,
      AuthorName: 'Ana',
      FromStateName: null,
      ToStateName: null,
      OccurredAt: '2026-10-05T12:00:00.000Z',
      From,
      To,
      Added: [],
      Removed: [],
      TitleRestored: null,
    })
    dublê.historico.mockResolvedValue([
      linha('h-1', 'CardSprintChanged', null, 'Sprint 1'),
      linha('h-2', 'CardSprintChanged', 'Sprint 1', 'Sprint 2'),
      linha('h-3', 'CardSprintChanged', 'Sprint 2', null),
      linha('h-4', 'CardPointsChanged', null, '2.5'),
    ])
    render(<ReportHistory projectPublicId="p-1" reportPublicId="c-1" versao={0} />)
    expect(await screen.findByText('Planejado na Sprint 1')).toBeTruthy()
    expect(screen.getByText('De Sprint 1 para Sprint 2')).toBeTruthy()
    expect(screen.getByText('De Sprint 2 para o backlog')).toBeTruthy()
    expect(screen.getByText('Estimativa: 2,5')).toBeTruthy()
  })
})

describe('as datas da sprint', () => {
  it('sem repetir o mes nem o ano: o ano so aparece quando nao e o de agora', () => {
    const hoje = new Date(2026, 9, 8)
    expect(sprintDates({ StartsOn: '2026-10-08', EndsOn: '2026-10-21' }, hoje)).toBe(
      '8 – 21 de out.',
    )
    expect(sprintDates({ StartsOn: '2026-10-22', EndsOn: '2026-11-04' }, hoje)).toBe(
      '22 de out. – 4 de nov.',
    )
    expect(sprintDates({ StartsOn: '2026-12-28', EndsOn: '2027-01-10' }, hoje)).toBe(
      '28 de dez. – 10 de jan. de 2027',
    )
    expect(sprintDates({ StartsOn: '2025-10-06', EndsOn: '2025-10-19' }, hoje)).toBe(
      '6 – 19 de out. de 2025',
    )
  })

  it('a barra do quadro diz as datas e quanto falta, pelo dia de quem olha', () => {
    hojeE(new Date(2026, 9, 8, 22, 30))
    render(
      <SprintBar
        sprint={sprint({ StartsOn: '2026-10-08', EndsOn: '2026-10-21' })}
        aoConcluir={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('region', { name: 'Sprint em andamento: Sprint 1' }).textContent,
    ).toContain('8 – 21 de out. · faltam 13 dias')
  })
})

describe('iniciar uma sprint', () => {
  const planejada = sprint({
    PublicId: 's-2',
    Number: 2,
    Name: 'Sprint 2',
    State: 'Planned',
    StartsOn: '2026-10-22',
    EndsOn: '2026-11-04',
    StartedAt: null,
    Cards: 3,
    DoneCards: 0,
    Points: 8,
    DonePoints: 0,
  })

  // 22h30 do dia 8 no relogio de quem usa: em UTC ja e o dia 9.
  beforeEach(() => hojeE(new Date(2026, 9, 8, 22, 30)))

  function abrir(
    extra: { semanas?: number; alvo?: SprintViewModel; mode?: 'start' | 'edit' } = {},
  ) {
    const aoSalvar = vi.fn()
    render(
      <SprintDialog
        projectPublicId="p-1"
        sprint={extra.alvo ?? planejada}
        mode={extra.mode ?? 'start'}
        semanas={extra.semanas}
        aoSalvar={aoSalvar}
        aoCancelar={vi.fn()}
      />,
    )
    const dialogo = screen.getByRole('dialog')
    return {
      aoSalvar,
      dialogo,
      comeca: within(dialogo).getByLabelText('Começa em') as HTMLInputElement,
      termina: within(dialogo).getByLabelText('Termina em') as HTMLInputElement,
    }
  }

  it('comeca hoje e dura o que o projeto diz; as datas planejadas ficam a um clique', async () => {
    dublê.iniciarSprint.mockImplementation(
      async (_p: string, _s: string, pedido: { StartsOn: string; EndsOn: string }) => ({
        ...planejada,
        State: 'Active',
        StartsOn: pedido.StartsOn,
        EndsOn: pedido.EndsOn,
      }),
    )
    const { aoSalvar, dialogo, comeca, termina } = abrir({ semanas: 2 })
    expect(screen.getByRole('dialog', { name: 'Iniciar Sprint 2' })).toBe(dialogo)
    expect(
      within(dialogo).getByText(
        '3 cards e 8 pontos. A partir daqui, o quadro mostra só esta sprint.',
      ),
    ).toBeTruthy()
    // Hoje, e hoje mais as duas semanas do projeto: as datas planejadas eram previsao (S-01).
    expect(comeca.value).toBe('2026-10-08')
    expect(termina.value).toBe('2026-10-21')
    expect(
      within(dialogo).getByText('Começa hoje. Planejada para 22 de out. – 4 de nov.'),
    ).toBeTruthy()

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Usar as datas planejadas' }))
    expect(comeca.value).toBe('2026-10-22')
    expect(termina.value).toBe('2026-11-04')
    expect(within(dialogo).getByText('Com as datas planejadas.')).toBeTruthy()

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Iniciar' }))
    await waitFor(() =>
      expect(dublê.iniciarSprint).toHaveBeenCalledWith('p-1', 's-2', {
        Name: 'Sprint 2',
        Goal: '',
        StartsOn: '2026-10-22',
        EndsOn: '2026-11-04',
        Today: '2026-10-08',
      }),
    )
    await waitFor(() => expect(aoSalvar).toHaveBeenCalled())
    expect(ultimoAviso()?.message).toBe('Sprint 2 em andamento.')
  })

  it('mudar o comeco leva o fim junto, ate a pessoa mexer no fim; o fim antes do comeco barra', () => {
    const { dialogo, comeca, termina } = abrir({ semanas: 2 })
    fireEvent.change(comeca, { target: { value: '2026-10-12' } })
    expect(termina.value).toBe('2026-10-25')
    // Nao comeca mais hoje: a frase so lembra o planejado.
    expect(within(dialogo).getByText('Planejada para 22 de out. – 4 de nov.')).toBeTruthy()

    // O fim escolhido a mao fica.
    fireEvent.change(termina, { target: { value: '2026-10-30' } })
    fireEvent.change(comeca, { target: { value: '2026-10-13' } })
    expect(termina.value).toBe('2026-10-30')

    fireEvent.change(termina, { target: { value: '2026-10-05' } })
    expect(within(dialogo).getByText('O último dia não pode vir antes do primeiro.')).toBeTruthy()
    expect(termina.getAttribute('aria-invalid')).toBe('true')
    expect(within(dialogo).getByRole('button', { name: 'Iniciar' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(dublê.iniciarSprint).not.toHaveBeenCalled()
  })

  it('sem a duracao do projeto, vale a duracao planejada desta sprint', () => {
    const { comeca, termina } = abrir({
      alvo: { ...planejada, StartsOn: '2026-10-22', EndsOn: '2026-10-28' },
    })
    expect(comeca.value).toBe('2026-10-08')
    expect(termina.value).toBe('2026-10-14')
  })

  it('a frase do planejado termina com um ponto so, com o mes abreviado ou com o ano', () => {
    const { dialogo } = abrir({
      alvo: { ...planejada, StartsOn: '2026-12-22', EndsOn: '2027-01-04' },
    })
    // As datas terminam no ponto do mes ("4 de nov.") ou no ano: "nov.." era o defeito.
    expect(
      within(dialogo).getByText('Começa hoje. Planejada para 22 de dez. – 4 de jan. de 2027.'),
    ).toBeTruthy()
  })

  it('editar mantem as datas da sprint e grava com o dia de quem edita; a falha fica no dialogo', async () => {
    dublê.editarSprint
      .mockRejectedValueOnce(new PanelError('Sprint em andamento.', 409))
      .mockResolvedValue({ ...planejada, Name: 'Sprint 2 — checkout' })
    const { aoSalvar, dialogo, comeca, termina } = abrir({ mode: 'edit' })
    expect(screen.getByRole('dialog', { name: 'Editar Sprint 2' })).toBe(dialogo)
    expect(comeca.value).toBe('2026-10-22')
    expect(termina.value).toBe('2026-11-04')
    expect(within(dialogo).queryByRole('button', { name: 'Usar as datas planejadas' })).toBeNull()

    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Sprint 2 — checkout' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Sprint em andamento.')).toBeTruthy()
    expect(aoSalvar).not.toHaveBeenCalled()

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(aoSalvar).toHaveBeenCalled())
    expect(dublê.editarSprint).toHaveBeenLastCalledWith('p-1', 's-2', {
      Name: 'Sprint 2 — checkout',
      Goal: '',
      StartsOn: '2026-10-22',
      EndsOn: '2026-11-04',
      Today: '2026-10-08',
    })
    expect(ultimoAviso()?.message).toBe('Sprint salva.')
  })
})

describe('concluir uma sprint', () => {
  const segunda = sprint({ PublicId: 's-2', Number: 2, Name: 'Sprint 2', State: 'Planned' })
  const terceira = sprint({ PublicId: 's-3', Number: 3, Name: 'Sprint 3', State: 'Planned' })

  beforeEach(() => hojeE(new Date(2026, 9, 8, 22, 30)))

  function concluir(alvo: SprintViewModel, planejadas: SprintViewModel[]) {
    const aoFechar = vi.fn()
    const aoIniciar = vi.fn()
    render(
      <CloseSprintDialog
        projectPublicId="p-1"
        sprint={alvo}
        planejadas={planejadas}
        aoFechar={aoFechar}
        aoCancelar={vi.fn()}
        aoIniciar={aoIniciar}
      />,
    )
    return { aoFechar, aoIniciar }
  }

  it('de saida, o que nao terminou vai para a proxima planejada; concluida, o aviso oferece inicia-la', async () => {
    dublê.fecharSprint.mockResolvedValue({
      Sprint: sprint({ State: 'Closed' }),
      Moved: 3,
      Destination: segunda,
    })
    const { aoFechar, aoIniciar } = concluir(sprint(), [segunda, terceira])
    // O padrao e o que quase todo time escolhe (S-16): a primeira planejada, sem escolher.
    expect(
      screen.getByRole('combobox', { name: 'Os 3 que não terminaram vão para' }).textContent,
    ).toContain('Sprint 2')
    fireEvent.click(screen.getByRole('button', { name: 'Concluir sprint' }))
    await waitFor(() =>
      expect(dublê.fecharSprint).toHaveBeenCalledWith('p-1', 's-1', {
        Destination: 'Sprint',
        SprintPublicId: 's-2',
        Today: '2026-10-08',
      }),
    )
    expect(aoFechar).toHaveBeenCalled()
    const aviso = ultimoAviso()
    expect(aviso?.message).toBe('Sprint 1 concluída. 3 cards foram para a Sprint 2.')
    expect(aviso?.action?.label).toBe('Iniciar a Sprint 2')
    act(() => aviso?.action?.run())
    expect(aoIniciar).toHaveBeenCalledWith(segunda)
  })

  it('sem planejada, vai para o backlog — e o aviso nao oferece iniciar o que nao existe', async () => {
    dublê.fecharSprint.mockResolvedValue({
      Sprint: sprint({ State: 'Closed' }),
      Moved: 1,
      Destination: null,
    })
    concluir(sprint({ Cards: 2 }), [])
    const campo = screen.getByRole('combobox', { name: 'O que não terminou vai para' })
    expect(campo.textContent).toContain('O backlog')
    fireEvent.click(screen.getByRole('button', { name: 'Concluir sprint' }))
    await waitFor(() =>
      expect(dublê.fecharSprint).toHaveBeenCalledWith('p-1', 's-1', {
        Destination: 'Backlog',
        SprintPublicId: null,
        Today: '2026-10-08',
      }),
    )
    expect(ultimoAviso()?.message).toBe('Sprint 1 concluída. 1 card foi para o backlog.')
    expect(ultimoAviso()?.action).toBeUndefined()
  })

  it('"Uma sprint nova": a API cria, e o aviso oferece iniciar a nova', async () => {
    const nova = sprint({ PublicId: 's-9', Number: 4, Name: 'Sprint 4', State: 'Planned' })
    dublê.fecharSprint.mockResolvedValue({
      Sprint: sprint({ State: 'Closed' }),
      Moved: 3,
      Destination: nova,
    })
    const { aoIniciar } = concluir(sprint(), [segunda])
    apertar(screen.getByRole('combobox', { name: 'Os 3 que não terminaram vão para' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Uma sprint nova' }))
    fireEvent.click(screen.getByRole('button', { name: 'Concluir sprint' }))
    await waitFor(() =>
      expect(dublê.fecharSprint).toHaveBeenCalledWith('p-1', 's-1', {
        Destination: 'NewSprint',
        SprintPublicId: null,
        Today: '2026-10-08',
      }),
    )
    expect(ultimoAviso()?.message).toBe('Sprint 1 concluída. 3 cards foram para a Sprint 4.')
    act(() => ultimoAviso()?.action?.run())
    expect(aoIniciar).toHaveBeenCalledWith(nova)
  })

  it('a frase do que terminou: sem estimativa nao fala de pontos; sem nada terminado, nao diz onde fica', () => {
    concluir(sprint({ Points: 0, DonePoints: 0 }), [])
    expect(
      screen.getByText('1 de 4 cards terminaram. O que terminou fica na sprint concluída.'),
    ).toBeTruthy()
    cleanup()
    concluir(sprint(), [])
    expect(
      screen.getByText(
        '1 de 4 cards terminaram — 2,5 de 13 pontos. O que terminou fica na sprint concluída.',
      ),
    ).toBeTruthy()
    cleanup()
    concluir(sprint({ DoneCards: 0, DonePoints: 0 }), [])
    expect(screen.getByText('0 de 4 cards terminaram — 0 de 13 pontos.')).toBeTruthy()
    cleanup()
    // Tudo terminou: nao ha o que mandar para lugar nenhum.
    concluir(sprint({ DoneCards: 4 }), [segunda])
    expect(screen.getByText('Todos os cards terminaram.')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('"Ver os 3" mostra quais nao terminaram e esconde de novo; a leitura que falha deixa tentar', async () => {
    dublê.listar.mockRejectedValueOnce(new Error('fora do ar')).mockResolvedValue({
      reports: [
        card({ PublicId: 'c-1', Number: 10, Title: 'Trocar o gateway', StateName: 'Fazendo' }),
        card({ PublicId: 'c-2', Number: 11, Title: 'Ja entregue', Finished: true }),
        card({ PublicId: 'c-3', Number: 12, Title: 'Rever o texto', StateName: 'A fazer' }),
      ],
      total: 3,
    })
    concluir(sprint(), [segunda])
    fireEvent.click(screen.getByRole('button', { name: 'Ver os 3' }))
    expect(
      await screen.findByText('Não deu para carregar a lista agora. Clique de novo para tentar.'),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ver os 3' }))
    const lista = await screen.findByRole('list')
    expect(dublê.listar).toHaveBeenLastCalledWith('p-1', 1, null, false, {
      order: 'backlog',
      pageSize: 100,
      sprint: 's-1',
    })
    // So os que nao terminaram, com o numero, o titulo e a coluna.
    expect(
      within(lista)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['#10Trocar o gatewayFazendo', '#12Rever o textoA fazer'])
    const esconder = screen.getByRole('button', { name: 'Esconder a lista' })
    expect(esconder.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(esconder)
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByRole('button', { name: 'Ver os 3' }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })

  it('a falha ao concluir fica no dialogo, e nada fecha', async () => {
    dublê.fecharSprint.mockRejectedValue(new PanelError('Sprint em andamento.', 409))
    const { aoFechar } = concluir(sprint(), [segunda])
    fireEvent.click(screen.getByRole('button', { name: 'Concluir sprint' }))
    expect(await screen.findByText('Sprint em andamento.')).toBeTruthy()
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Concluir Sprint 1' })).toBeTruthy()
  })
})

describe('o backlog por dentro', () => {
  const ativa = sprint()
  const planejada = sprint({
    PublicId: 's-2',
    Number: 2,
    Name: 'Sprint 2',
    State: 'Planned',
    StartsOn: '2026-10-19',
    EndsOn: '2026-11-01',
    StartedAt: null,
    Cards: 0,
    DoneCards: 0,
    Points: 0,
    DonePoints: 0,
  })
  const eu = { UserPublicId: 'u-eu', Name: 'Eu', AvatarUrl: null, InTeam: true }

  /**
   * O backlog de mentira: cada lista com os seus cards, lidos na ordem; a busca casa o
   * titulo ou o #numero, e "Meus cards", os da pessoa; mover pela rota da sprint muda a
   * lista, como a API — a releitura depois de mover mostra onde o card ficou.
   */
  function backlogDeMentira(inicial: Record<string, ReportSummaryViewModel[]>) {
    const listas: Record<string, ReportSummaryViewModel[]> = Object.fromEntries(
      Object.entries(inicial).map(([lista, cards]) => [lista, [...cards]]),
    )
    dublê.listar.mockImplementation(async (_p, _pagina, _estado, _arquivo, opcoes) => {
      const busca: string = (opcoes?.filters?.search ?? '').trim()
      const meus: boolean = opcoes?.filters?.assignees?.includes('me') ?? false
      const cards = (listas[opcoes?.sprint] ?? []).filter(
        (item) =>
          (busca === '' || `#${item.Number}` === busca || (item.Title ?? '').includes(busca)) &&
          (!meus || item.Assignee?.UserPublicId === eu.UserPublicId),
      )
      return { reports: cards, total: cards.length }
    })
    dublê.planejar.mockImplementation(async (_p, id, pedido) => {
      let movido: ReportSummaryViewModel | undefined
      for (const cards of Object.values(listas)) {
        const onde = cards.findIndex((item) => item.PublicId === id)
        if (onde >= 0) movido = cards.splice(onde, 1)[0]
      }
      if (!movido) throw new PanelError('Card nao encontrado.', 404)
      listas[pedido.SprintPublicId ?? 'backlog'] ??= []
      const destino = listas[pedido.SprintPublicId ?? 'backlog'] ?? []
      const lugar = pedido.AfterPublicId
        ? destino.findIndex((item) => item.PublicId === pedido.AfterPublicId) + 1
        : pedido.Top
          ? 0
          : destino.length
      destino.splice(lugar, 0, movido)
      return { ...movido, Description: null }
    })
  }

  function montarBacklog(
    sprints: SprintViewModel[],
    extra: { projeto?: string; sprintWeeks?: number } = {},
  ) {
    const aoMudou = vi.fn()
    render(
      <MemoryRouter>
        <SprintBacklog
          projectPublicId={extra.projeto ?? 'p-1'}
          sprints={sprints}
          colunas={null}
          versao={0}
          aoMudou={aoMudou}
          soonDays={2}
          sprintWeeks={extra.sprintWeeks}
        />
      </MemoryRouter>,
    )
    return aoMudou
  }

  /** A lista de cards de uma secao ("Cards do backlog", "Cards de Sprint 2"). */
  const lista = (nome: string) => screen.getByRole('list', { name: nome })
  /** Os titulos dos cards de uma lista, na ordem da tela. */
  const titulos = (nome: string) =>
    within(lista(nome))
      .queryAllByRole('link')
      .map((link) => link.textContent)
  const linhaDe = (titulo: string) =>
    screen.getByRole('link', { name: titulo }).closest('li') as HTMLElement

  it('a linha mostra a prioridade, e o prazo so quando perto ou vencido', async () => {
    const ontem = addDays(todayIso(), -1)
    backlogDeMentira({
      's-1': [],
      backlog: [
        card({
          PublicId: 'c-2',
          Number: 11,
          Title: 'Rever o texto',
          DueDate: ontem,
          Priority: { PublicId: 'pr-a', Name: 'Alta', Color: 'Orange', IsActive: true },
        }),
        card({
          PublicId: 'c-3',
          Number: 12,
          Title: 'Trocar o banner',
          DueDate: addDays(todayIso(), 1),
        }),
        card({ PublicId: 'c-4', Number: 13, Title: 'Com tempo', DueDate: addDays(todayIso(), 30) }),
        card({ PublicId: 'c-5', Number: 14, Title: 'Ja feito', DueDate: ontem, Finished: true }),
      ],
    })
    montarBacklog([ativa])
    await screen.findByRole('link', { name: 'Rever o texto' })

    const vencido = linhaDe('Rever o texto')
    expect(within(vencido).getByText('Alta')).toBeTruthy()
    expect(within(vencido).getByText(/venceu ontem/)).toBeTruthy()
    expect(within(linhaDe('Trocar o banner')).getByText(/vence amanhã/)).toBeTruthy()
    // O que ainda tem tempo nao ajuda a planejar; o que terminou nao tem prazo a cumprir.
    expect(within(linhaDe('Com tempo')).queryByText(/Prazo/)).toBeNull()
    expect(within(linhaDe('Ja feito')).queryByText(/Prazo/)).toBeNull()
  })

  it('os pontos se estimam na linha: o invalido mostra a regra ali, Enter grava, Esc desiste', async () => {
    backlogDeMentira({
      's-1': [],
      backlog: [card({ PublicId: 'c-2', Number: 11, Title: 'Rever o texto' })],
    })
    dublê.pontos.mockImplementation(async (_p, id, pedido) => ({
      ...card({ PublicId: id, Number: 11, Title: 'Rever o texto', StoryPoints: pedido.Points }),
      Description: null,
    }))
    const aoMudou = montarBacklog([ativa])

    fireEvent.click(await screen.findByRole('button', { name: 'Estimar #11: sem estimativa' }))
    const campo = screen.getByRole('textbox', { name: 'Pontos de #11' })
    expect(document.activeElement).toBe(campo)

    fireEvent.change(campo, { target: { value: '1000' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    // A regra aparece ali, e o campo fica aberto para corrigir.
    expect(screen.getByRole('alert').textContent).toBe('De 0 a 999, de meio em meio ponto.')
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(dublê.pontos).not.toHaveBeenCalled()

    fireEvent.change(campo, { target: { value: '2,5' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(dublê.pontos).toHaveBeenCalledWith('p-1', 'c-2', { Points: 2.5 }))
    const selo = await screen.findByRole('button', {
      name: 'Estimativa de #11: 2,5 pontos. Mudar',
    })
    expect(selo.textContent).toContain('2,5 pts')
    expect(aoMudou).toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(selo))

    // Esc desiste: nada vai a API, e o foco volta ao selo.
    fireEvent.click(selo)
    const deNovo = screen.getByRole('textbox', { name: 'Pontos de #11' }) as HTMLInputElement
    expect(deNovo.value).toBe('2,5')
    fireEvent.change(deNovo, { target: { value: '8' } })
    fireEvent.keyDown(deNovo, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'Pontos de #11' })).toBeNull()
    expect(dublê.pontos).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Estimativa de #11: 2,5 pontos. Mudar' }),
      ),
    )
  })

  it('sair do campo grava o que vale e desiste do que nao vale; vazio tira a estimativa; a subtarefa so mostra', async () => {
    backlogDeMentira({
      's-1': [],
      backlog: [
        card({ PublicId: 'c-2', Number: 11, Title: 'Rever o texto', StoryPoints: 3 }),
        card({
          PublicId: 'c-6',
          Number: 15,
          Title: 'Parte do texto',
          StoryPoints: 1,
          Parent: { PublicId: 'c-2', Number: 11, Headline: 'Rever o texto' },
        }),
      ],
    })
    dublê.pontos.mockImplementation(async (_p, id, pedido) => ({
      ...card({ PublicId: id, Number: 11, Title: 'Rever o texto', StoryPoints: pedido.Points }),
      Description: null,
    }))
    montarBacklog([ativa])

    fireEvent.click(
      await screen.findByRole('button', { name: 'Estimativa de #11: 3 pontos. Mudar' }),
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Pontos de #11' }), {
      target: { value: 'muito' },
    })
    fireEvent.blur(screen.getByRole('textbox', { name: 'Pontos de #11' }))
    expect(screen.queryByRole('textbox', { name: 'Pontos de #11' })).toBeNull()
    expect(dublê.pontos).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Estimativa de #11: 3 pontos. Mudar' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Pontos de #11' }), {
      target: { value: '' },
    })
    fireEvent.blur(screen.getByRole('textbox', { name: 'Pontos de #11' }))
    await waitFor(() => expect(dublê.pontos).toHaveBeenCalledWith('p-1', 'c-2', { Points: null }))
    expect(await screen.findByRole('button', { name: 'Estimar #11: sem estimativa' })).toBeTruthy()

    // A subtarefa vai com o pai: o selo so mostra, "1 pt" para quem ve e "1 ponto" para o leitor de tela.
    const subtarefa = linhaDe('Parte do texto')
    expect(within(subtarefa).getByText('1 pt')).toBeTruthy()
    expect(within(subtarefa).getByText('1 ponto')).toBeTruthy()
    expect(within(subtarefa).queryByRole('button', { name: /^Estima/ })).toBeNull()
  })

  it('a busca vai a API em cada lista, na ordem do backlog; "Meus cards" e "Limpar busca"', async () => {
    backlogDeMentira({
      's-1': [card({ PublicId: 'c-1', Number: 10, Title: 'Trocar o gateway', StoryPoints: 3 })],
      's-2': [],
      backlog: [
        card({ PublicId: 'c-2', Number: 11, Title: 'Rever o texto' }),
        card({ PublicId: 'c-3', Number: 12, Title: 'Rever o banner', Assignee: eu }),
      ],
    })
    montarBacklog([ativa, planejada])
    await screen.findByRole('link', { name: 'Rever o texto' })
    dublê.listar.mockClear()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no backlog' }), {
      target: { value: 'Rever' },
    })
    await waitFor(() =>
      expect(dublê.listar).toHaveBeenCalledWith('p-1', 1, null, false, {
        order: 'backlog',
        pageSize: 100,
        sprint: 'backlog',
        filters: { ...NO_REPORT_FILTERS, search: 'Rever', assignees: [] },
      }),
    )
    // Cada lista e lida com a busca; o que nao bate some, e a ordem e a do time.
    expect(dublê.listar.mock.calls.map((chamada) => chamada[4].sprint).sort()).toEqual([
      'backlog',
      's-1',
      's-2',
    ])
    await waitFor(() => expect(titulos('Cards de Sprint 1')).toEqual([]))
    expect(titulos('Cards do backlog')).toEqual(['Rever o texto', 'Rever o banner'])
    expect(
      within(lista('Cards de Sprint 1')).getByText('Nenhum card desta lista na busca.'),
    ).toBeTruthy()
    expect(screen.getByText('2 na busca')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Meus cards' }))
    expect(screen.getByRole('button', { name: 'Meus cards' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    await waitFor(() => expect(titulos('Cards do backlog')).toEqual(['Rever o banner']))
    expect(dublê.listar).toHaveBeenLastCalledWith(
      'p-1',
      1,
      null,
      false,
      expect.objectContaining({
        filters: { ...NO_REPORT_FILTERS, search: 'Rever', assignees: ['me'] },
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }))
    await waitFor(() => expect(titulos('Cards de Sprint 1')).toEqual(['Trocar o gateway']))
    expect(dublê.listar).toHaveBeenLastCalledWith(
      'p-1',
      1,
      null,
      false,
      expect.objectContaining({ filters: undefined }),
    )
    expect(
      (screen.getByRole('searchbox', { name: 'Buscar no backlog' }) as HTMLInputElement).value,
    ).toBe('')
    expect(screen.getByRole('button', { name: 'Meus cards' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
    expect(screen.queryByRole('button', { name: 'Limpar busca' })).toBeNull()
  })

  it('mover para outra lista pelo menu avisa para onde foi e desfaz no lugar; o foco fica na linha seguinte', async () => {
    backlogDeMentira({
      's-1': [card({ PublicId: 'c-1', Number: 10, Title: 'Trocar o gateway' })],
      's-2': [],
      backlog: [
        card({ PublicId: 'c-2', Number: 11, Title: 'Rever o texto' }),
        card({ PublicId: 'c-3', Number: 12, Title: 'Trocar o banner' }),
        card({ PublicId: 'c-4', Number: 13, Title: 'Medir o checkout' }),
      ],
    })
    const aoMudou = montarBacklog([ativa, planejada])
    await screen.findByRole('link', { name: 'Trocar o banner' })

    apertar(screen.getByRole('button', { name: 'Mover #12 para…' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mover para Sprint 2' }))
    await waitFor(() =>
      expect(dublê.planejar).toHaveBeenCalledWith('p-1', 'c-3', {
        SprintPublicId: 's-2',
        AfterPublicId: null,
        Top: false,
      }),
    )
    await waitFor(() => expect(titulos('Cards de Sprint 2')).toEqual(['Trocar o banner']))
    expect(titulos('Cards do backlog')).toEqual(['Rever o texto', 'Medir o checkout'])
    expect(aoMudou).toHaveBeenCalled()
    // O foco nao cai no comeco da pagina: vai ao menu da linha seguinte, onde a pessoa estava.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mover #13 para…' })),
    )

    const aviso = ultimoAviso()
    expect(aviso?.message).toBe('#12 foi para a Sprint 2.')
    expect(aviso?.action?.label).toBe('Desfazer')
    act(() => aviso?.action?.run())
    // Volta para a lista e para o lugar de onde saiu: logo depois do #11.
    await waitFor(() =>
      expect(dublê.planejar).toHaveBeenLastCalledWith('p-1', 'c-3', {
        SprintPublicId: null,
        AfterPublicId: 'c-2',
        Top: false,
      }),
    )
    await waitFor(() =>
      expect(titulos('Cards do backlog')).toEqual([
        'Rever o texto',
        'Trocar o banner',
        'Medir o checkout',
      ]),
    )
    expect(titulos('Cards de Sprint 2')).toEqual([])
  })

  it('o primeiro da lista, desfeito, volta ao topo; mover dentro da propria lista nao avisa', async () => {
    backlogDeMentira({
      's-1': [],
      backlog: [
        card({ PublicId: 'c-2', Number: 11, Title: 'Rever o texto' }),
        card({ PublicId: 'c-3', Number: 12, Title: 'Trocar o banner' }),
      ],
    })
    montarBacklog([ativa])
    await screen.findByRole('link', { name: 'Rever o texto' })

    apertar(screen.getByRole('button', { name: 'Mover #11 para…' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mover para Sprint 1' }))
    await waitFor(() => expect(titulos('Cards de Sprint 1')).toEqual(['Rever o texto']))
    expect(ultimoAviso()?.message).toBe('#11 foi para a Sprint 1.')
    act(() => ultimoAviso()?.action?.run())
    await waitFor(() =>
      expect(dublê.planejar).toHaveBeenLastCalledWith('p-1', 'c-2', {
        SprintPublicId: null,
        AfterPublicId: null,
        Top: true,
      }),
    )
    await waitFor(() =>
      expect(titulos('Cards do backlog')).toEqual(['Rever o texto', 'Trocar o banner']),
    )

    useToastStore.setState({ toasts: [] })
    apertar(screen.getByRole('button', { name: 'Mover #12 para…' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Para o topo desta lista' }))
    await waitFor(() =>
      expect(titulos('Cards do backlog')).toEqual(['Trocar o banner', 'Rever o texto']),
    )
    // O card fica a vista: nada a avisar nem a desfazer.
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('cada lista se recolhe, e continua recolhida neste navegador — so neste projeto', async () => {
    backlogDeMentira({
      's-1': [],
      backlog: [card({ PublicId: 'c-2', Number: 11, Title: 'Rever o texto' })],
    })
    montarBacklog([ativa])
    await screen.findByRole('link', { name: 'Rever o texto' })

    const recolher = screen.getByRole('button', { name: 'Recolher Backlog' })
    expect(recolher.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(recolher)
    expect(
      screen.getByRole('button', { name: 'Expandir Backlog' }).getAttribute('aria-expanded'),
    ).toBe('false')
    expect(screen.queryByRole('link', { name: 'Rever o texto' })).toBeNull()
    expect(
      within(lista('Cards do backlog')).getByText(
        'Lista recolhida: 1 card. Um card arrastado até aqui vai para o fim dela.',
      ),
    ).toBeTruthy()
    // A sprint ao lado nao recolheu junto.
    expect(screen.getByRole('button', { name: 'Recolher Sprint 1' })).toBeTruthy()

    cleanup()
    montarBacklog([ativa])
    expect(await screen.findByRole('button', { name: 'Expandir Backlog' })).toBeTruthy()
    cleanup()
    montarBacklog([ativa], { projeto: 'p-2' })
    expect(await screen.findByRole('button', { name: 'Recolher Backlog' })).toBeTruthy()
  })

  it('sem nenhuma sprint, o backlog ensina o caminho; vazio, diz que os cards novos entram ali', async () => {
    backlogDeMentira({ backlog: [] })
    montarBacklog([])
    expect(
      await screen.findByText(/^Comece criando uma sprint, leve para ela os cards desta semana/),
    ).toBeTruthy()
    // Um "Criar sprint" so: o do quadro que ensina, e nao outro no cabecalho do backlog.
    expect(screen.getAllByRole('button', { name: 'Criar sprint' })).toHaveLength(1)
    expect(screen.getByText('Nada no backlog. Os cards novos entram aqui.')).toBeTruthy()
  })

  it('o rodape diz quantos ficaram de fora, contra o que a leitura trouxe', async () => {
    dublê.listar.mockImplementation(async (_p, _pagina, _estado, _arquivo, opcoes) =>
      opcoes.sprint === 'backlog'
        ? {
            reports: [
              card({ PublicId: 'c-2', Number: 11, Title: 'Rever o texto' }),
              card({ PublicId: 'c-3', Number: 12, Title: 'Trocar o banner' }),
            ],
            total: 130,
          }
        : { reports: [], total: 0 },
    )
    montarBacklog([ativa])
    expect(
      await screen.findByText('Mostrando os 2 primeiros de 130. Os outros estão na Lista.'),
    ).toBeTruthy()
  })

  it('a leitura que falha diz, e "Tentar de novo" le de novo', async () => {
    dublê.listar.mockRejectedValue(new Error('fora do ar'))
    montarBacklog([ativa])
    expect(
      await screen.findByText(
        'Não deu para carregar o backlog agora. Nada se perdeu: a falha foi ao consultar.',
      ),
    ).toBeTruthy()
    backlogDeMentira({
      's-1': [],
      backlog: [card({ PublicId: 'c-2', Number: 11, Title: 'Rever o texto' })],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('link', { name: 'Rever o texto' })).toBeTruthy()
  })

  it('iniciar pelo backlog abre o dialogo com a duracao do projeto, e avisa quem precisa saber', async () => {
    hojeE(new Date(2026, 9, 8, 22, 30))
    backlogDeMentira({ 's-2': [], backlog: [] })
    dublê.iniciarSprint.mockResolvedValue({ ...planejada, State: 'Active' })
    const aoMudou = montarBacklog([planejada], { sprintWeeks: 1 })

    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar sprint' }))
    const dialogo = screen.getByRole('dialog', { name: 'Iniciar Sprint 2' })
    expect((within(dialogo).getByLabelText('Começa em') as HTMLInputElement).value).toBe(
      '2026-10-08',
    )
    expect((within(dialogo).getByLabelText('Termina em') as HTMLInputElement).value).toBe(
      '2026-10-14',
    )
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Iniciar' }))
    await waitFor(() => expect(aoMudou).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: 'Iniciar Sprint 2' })).toBeNull()
  })

  it('apagar a planejada diz o que acontece com os cards dela; a em andamento nao se apaga', async () => {
    backlogDeMentira({ 's-1': [], 's-2': [], backlog: [] })
    dublê.apagarSprint.mockResolvedValue(undefined)
    const aoMudou = montarBacklog([ativa, { ...planejada, Cards: 2 }])
    await screen.findByRole('button', { name: 'Mais ações de Sprint 2' })

    apertar(screen.getByRole('button', { name: 'Mais ações de Sprint 1' }))
    const menu = await screen.findByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Editar'])
    fireEvent.keyDown(menu, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    apertar(screen.getByRole('button', { name: 'Mais ações de Sprint 2' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Apagar' }))
    const pergunta = await screen.findByRole('alertdialog', { name: 'Apagar Sprint 2' })
    expect(
      within(pergunta).getByText(
        'A sprint é apagada, e os 2 cards dela voltam para o fim do backlog. Nada mais muda.',
      ),
    ).toBeTruthy()
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(dublê.apagarSprint).toHaveBeenCalledWith('p-1', 's-2'))
    expect(ultimoAviso()?.message).toBe('Sprint 2 apagada.')
    expect(aoMudou).toHaveBeenCalled()
  })
})

describe('o quadro sem sprint em andamento', () => {
  it('diz por que esta vazio e oferece o proximo passo: iniciar a planejada, ou ir ao backlog', () => {
    const proxima = sprint({ PublicId: 's-2', Name: 'Sprint 2', State: 'Planned' })
    const aoIniciar = vi.fn()
    const aoIrAoBacklog = vi.fn()
    render(<NoActiveSprint proxima={proxima} aoIniciar={aoIniciar} aoIrAoBacklog={aoIrAoBacklog} />)
    expect(
      screen.getByText(/os cards em trabalho estão no Backlog e nas sprints planejadas\.$/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar a Sprint 2' }))
    expect(aoIniciar).toHaveBeenCalledWith(proxima)
    fireEvent.click(screen.getByRole('button', { name: 'Ir para o Backlog' }))
    expect(aoIrAoBacklog).toHaveBeenCalled()

    cleanup()
    // Sem planejada, ensina onde criar a primeira — e nao oferece iniciar.
    render(<NoActiveSprint proxima={null} aoIniciar={aoIniciar} aoIrAoBacklog={aoIrAoBacklog} />)
    expect(screen.getByText(/Lá, crie a primeira sprint/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Iniciar/ })).toBeNull()
  })

  it('as sprints que nao vieram: diz, em vez de carregar para sempre, e tenta de novo', () => {
    const aoTentar = vi.fn()
    render(<SprintsFailed aoTentar={aoTentar} />)
    expect(
      screen.getByText(
        'Não deu para carregar as sprints agora. Nada se perdeu: a falha foi ao consultar.',
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentar).toHaveBeenCalled()
  })
})

describe('as sprints do filtro da lista', () => {
  const concluida = sprint({ PublicId: 's-0', Number: 0, Name: 'Sprint 0', State: 'Closed' })
  const abertas = [sprint(), sprint({ PublicId: 's-2', Name: 'Sprint 2', State: 'Planned' })]

  it('le as concluidas a parte, so ligado; rele quando muda o que as abertas mostram', async () => {
    dublê.listarSprints.mockResolvedValue([...abertas, concluida])
    const { result, rerender } = renderHook(
      ({ ligado, lidas }: { ligado: boolean; lidas: SprintViewModel[] | null }) =>
        useSprintsForFilter('p-1', ligado, lidas),
      { initialProps: { ligado: false, lidas: abertas } },
    )
    // Desligado (fora da Lista, ou sem as sprints): nada lido.
    expect(result.current).toBeNull()
    expect(dublê.listarSprints).not.toHaveBeenCalled()

    rerender({ ligado: true, lidas: abertas })
    await waitFor(() => expect(result.current).toEqual([...abertas, concluida]))
    expect(dublê.listarSprints).toHaveBeenCalledWith('p-1', { closed: true })
    expect(dublê.listarSprints).toHaveBeenCalledTimes(1)

    // As abertas relidas iguais (outra lista, o mesmo conteudo): nada a reler.
    rerender({ ligado: true, lidas: abertas.map((item) => ({ ...item })) })
    expect(dublê.listarSprints).toHaveBeenCalledTimes(1)

    // A Sprint 1 foi concluida: as abertas mudaram, e esta lista e relida por tras —
    // sem voltar a nula no meio (o filtro nela continua).
    rerender({ ligado: true, lidas: [abertas[1] as SprintViewModel] })
    expect(result.current).not.toBeNull()
    await waitFor(() => expect(dublê.listarSprints).toHaveBeenCalledTimes(2))
  })

  it('ao ligar, as abertas que chegam pela primeira vez nao fazem reler', async () => {
    // A tela abre com as sprints ainda desligadas (o Ciclo nao chegou): as abertas vem
    // vazias; ligadas, sao lidas do zero (nulas) e chegam. Isso e a primeira leitura, e
    // nao uma mudanca — antes, as concluidas eram lidas duas vezes a cada entrada na Lista.
    dublê.listarSprints.mockResolvedValue([...abertas, concluida])
    const { rerender } = renderHook(
      ({ ligado, lidas }: { ligado: boolean; lidas: SprintViewModel[] | null }) =>
        useSprintsForFilter('p-1', ligado, lidas),
      { initialProps: { ligado: false, lidas: [] as SprintViewModel[] | null } },
    )
    rerender({ ligado: true, lidas: [] })
    rerender({ ligado: true, lidas: null })
    rerender({ ligado: true, lidas: abertas })
    await waitFor(() => expect(dublê.listarSprints).toHaveBeenCalledTimes(1))
    await new Promise((pronto) => setTimeout(pronto, 50))
    expect(dublê.listarSprints).toHaveBeenCalledTimes(1)
  })

  it('falhando a leitura com as concluidas, fica com as abertas', async () => {
    dublê.listarSprints.mockRejectedValue(new Error('fora do ar'))
    const { result } = renderHook(() => useSprintsForFilter('p-1', true, abertas))
    await waitFor(() => expect(result.current).toEqual(abertas))
  })
})
