// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummaryViewModel, SprintViewModel } from '@/contracts'
import { CardFields } from '@/features/reports/CardFields'
import { ReportHistory } from '@/features/reports/ReportHistory'
import { SprintBacklog } from '@/features/reports/sprints/SprintBacklog'
import {
  CloseSprintDialog,
  daysLeft,
  SprintBar,
  timeLeftText,
} from '@/features/reports/sprints/sprintLook'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

instalarRemendosDoRadix()

/**
 * O QUE ESTES TESTES TRAVAM: as sprints no painel.
 *
 * - **O prazo da sprint pelo dia de quem olha**, e a barra do quadro com o que falta.
 * - **Concluir manda o destino** do que nao terminou: o backlog, uma planejada, uma nova.
 * - **O backlog**: as sprints em cima, o backlog embaixo, cada um com os seus cards; o
 *   menu do card move para outra lista (no fim) ou para o topo; iniciar fica fechado
 *   com outra em andamento; criar sprint.
 * - **Os campos do card**: a sprint e os pontos so com a sprint ligada; pontos de meio em
 *   meio, com virgula; a subtarefa vai com o pai e nao leva pontos.
 * - **O historico** conta a sprint e a estimativa.
 */
const dublê = vi.hoisted(() => ({
  listarSprints: vi.fn(),
  criarSprint: vi.fn(),
  fecharSprint: vi.fn(),
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
      startSprint: vi.fn(),
      updateSprint: vi.fn(),
      deleteSprint: vi.fn(),
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
    Assignee: null,
    Priority: null,
    Labels: [],
    DueDate: null,
    CommentCount: 0,
    AttachmentCount: 0,
    Closed: false,
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

afterEach(cleanup)
beforeEach(() => {
  for (const dublé of Object.values(dublê)) dublé.mockReset()
})

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

  it('concluir manda o destino escolhido: uma planejada', async () => {
    dublê.fecharSprint.mockResolvedValue({
      Sprint: sprint({ State: 'Closed' }),
      Moved: 3,
      Destination: sprint({ PublicId: 's-2', Name: 'Sprint 2', State: 'Planned' }),
    })
    const aoFechar = vi.fn()
    render(
      <CloseSprintDialog
        projectPublicId="p-1"
        sprint={sprint()}
        planejadas={[sprint({ PublicId: 's-2', Name: 'Sprint 2', State: 'Planned' })]}
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
    fireEvent.click(await screen.findByRole('option', { name: 'Sprint 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Concluir sprint' }))
    await waitFor(() =>
      expect(dublê.fecharSprint).toHaveBeenCalledWith('p-1', 's-1', {
        Destination: 'Sprint',
        SprintPublicId: 's-2',
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
    // Com uma em andamento, a planejada nao inicia — e diz por que, escrito.
    expect(
      within(secoes[1] as HTMLElement).queryByRole('button', { name: 'Iniciar sprint' }),
    ).toBeNull()
    expect(
      within(secoes[1] as HTMLElement).getByText('Inicia depois que a em andamento for concluída'),
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
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Para o topo' }))
    await waitFor(() =>
      expect(dublê.planejar).toHaveBeenCalledWith('p-1', 'c-1', {
        SprintPublicId: 's-1',
        AfterPublicId: null,
        Top: true,
      }),
    )
  })

  it('"Criar sprint" cria uma planejada de fábrica', async () => {
    dublê.criarSprint.mockResolvedValue(
      sprint({ PublicId: 's-3', Name: 'Sprint 3', State: 'Planned' }),
    )
    const aoMudou = montar([planejada])
    fireEvent.click(await screen.findByRole('button', { name: 'Criar sprint' }))
    await waitFor(() => expect(dublê.criarSprint).toHaveBeenCalledWith('p-1', {}))
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
    expect(screen.queryByRole('textbox', { name: 'Pontos' })).toBeNull()
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
    fireEvent.click(await screen.findByRole('option', { name: 'Sprint 1 (em andamento)' }))
    await waitFor(() =>
      expect(dublê.planejar).toHaveBeenCalledWith('p-1', 'c-1', { SprintPublicId: 's-1' }),
    )

    const pontos = screen.getByRole('textbox', { name: 'Pontos' })
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
    expect(screen.queryByRole('textbox', { name: 'Pontos' })).toBeNull()
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
