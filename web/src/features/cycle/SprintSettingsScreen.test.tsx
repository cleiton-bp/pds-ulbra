// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CycleSettingsViewModel,
  ProjectViewModel,
  ReportStateCountViewModel,
} from '@/contracts'
import { SprintSettingsScreen } from '@/features/cycle/SprintSettingsScreen'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Ligar as sprints diz o que vai acontecer com o quadro, antes de salvar.** Com as
 * sprints, o quadro mostra so a sprint em andamento: o time ligava, salvava e
 * "perdia" os cards — que tinham ido para o Backlog. A frase conta os cards em
 * trabalho (as colunas que nao encerram) e so aparece quando ha algum; depois de
 * salvar, a tela mostra o caminho seguinte.
 *
 * **A tela salva o registro inteiro do ciclo, e nao so o que mostra.** As sprints
 * moram no mesmo registro do encerramento e das regras do quadro, e o salvamento
 * substitui tudo: mandar so os dois campos daqui apagaria o resto — e a resposta
 * viria com os padroes, parecendo certa.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<CycleSettingsViewModel>>(),
  salvar: vi.fn(),
  contar: vi.fn<() => Promise<ReportStateCountViewModel[]>>(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectCycleSettingsService: {
      getCycleSettings: dublê.ler,
      saveCycleSettings: dublê.salvar,
    },
    projectReportService: { ...real.projectReportService, listReportCounts: dublê.contar },
  }
})

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

/** O que a API leu, com o que nao e desta tela fora do padrao de fabrica. */
const lido: CycleSettingsViewModel = {
  ClosureTrigger: 'Button',
  PublicDelayMinutes: 15,
  AllowsReopen: false,
  ReopenStatePublicId: null,
  ReopenRequiresComment: true,
  TrackingCodeCanAct: false,
  SatisfactionEnabled: true,
  SatisfactionStyle: 'Stars',
  SatisfactionRequired: false,
  InfoRequestEnabled: true,
  InfoRequestWarnDays: 5,
  InfoRequestCloseDays: 9,
  AcceptsQuestionsDefault: true,
  AllowsReportArchiving: false,
  LastColumnVisibleDays: 0,
  DueSoonDays: 4,
  SprintsEnabled: false,
  SprintLengthWeeks: 2,
}

function contagem(
  statePublicId: string | null,
  total: number,
  closesReport = false,
): ReportStateCountViewModel {
  return {
    StatePublicId: statePublicId,
    StateName: statePublicId,
    IsActive: true,
    ClosesReport: closesReport,
    Total: total,
  }
}

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/projects/:publicId',
        element: <Outlet context={{ project: projeto }} />,
        children: [
          { path: 'sprints', element: <SprintSettingsScreen /> },
          { path: 'reports', element: <p>tela de trabalho</p> },
        ],
      },
    ],
    { initialEntries: ['/projects/p-1/sprints'] },
  )

  render(<RouterProvider router={router} />)
  return router
}

const caixa = () => screen.findByRole('checkbox', { name: /Trabalhar em sprints/ })

// A duracao e uma caixa de escolha do produto, e o jsdom nao tem o que ela usa.
instalarRemendosDoRadix()

describe('SprintSettingsScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.ler.mockResolvedValue(lido)
    dublê.contar.mockResolvedValue([])
  })

  it('desligadas, a tela mostra a caixa desmarcada, sem a duração e sem a barra', async () => {
    montar()

    expect(((await caixa()) as HTMLInputElement).checked).toBe(false)
    expect(screen.queryByRole('combobox', { name: 'Cada sprint nasce com' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).toBeNull()
    // A conta so e pedida quando a pessoa marca: e para a frase do aviso.
    expect(dublê.contar).not.toHaveBeenCalled()
  })

  it('marcar num projeto com cards em trabalho avisa quantos vão para o Backlog', async () => {
    dublê.contar.mockResolvedValue([
      contagem('s-1', 4),
      contagem('s-2', 3),
      // A coluna que encerra e a linha sem coluna nao estao "em trabalho no quadro".
      contagem('s-3', 9, true),
      contagem(null, 2),
    ])
    montar()

    fireEvent.click(await caixa())

    const aviso = await screen.findByText(/Hoje há 7 cards em trabalho no quadro/)
    expect(aviso.textContent).toContain('eles vão para o Backlog')
    expect(dublê.contar).toHaveBeenCalledWith('p-1')
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('um card só: a frase no singular', async () => {
    dublê.contar.mockResolvedValue([contagem('s-1', 1)])
    montar()

    fireEvent.click(await caixa())

    expect(await screen.findByText(/Hoje há 1 card em trabalho no quadro/)).toBeTruthy()
  })

  it('sem card em trabalho, não há o que avisar', async () => {
    dublê.contar.mockResolvedValue([contagem('s-3', 6, true)])
    montar()

    fireEvent.click(await caixa())

    await waitFor(() => expect(dublê.contar).toHaveBeenCalled())
    expect(screen.queryByText(/em trabalho no quadro/)).toBeNull()
  })

  it('salvar manda o registro que leu, com só as sprints mudadas', async () => {
    dublê.salvar.mockResolvedValue({ ...lido, SprintsEnabled: true })
    montar()

    fireEvent.click(await caixa())
    const barra = screen.getByRole('region', { name: 'Alterações não salvas' })
    fireEvent.click(within(barra).getByRole('button', { name: 'Salvar' }))

    // **O ponto do teste.** O encerramento, os prazos e as regras do quadro voltam
    // como vieram — e nao com os padroes.
    await waitFor(() =>
      expect(dublê.salvar).toHaveBeenCalledWith('p-1', { ...lido, SprintsEnabled: true }),
    )
  })

  it('depois de ligar, a tela diz o próximo passo e leva ao Trabalho', async () => {
    dublê.contar.mockResolvedValue([contagem('s-1', 2)])
    dublê.salvar.mockResolvedValue({ ...lido, SprintsEnabled: true })
    const router = montar()

    fireEvent.click(await caixa())
    await screen.findByText(/Hoje há 2 cards/)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Sprints ligadas.')).toBeTruthy()
    // O aviso de antes sai: o que ele dizia ja aconteceu.
    expect(screen.queryByText(/Hoje há 2 cards/)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).toBeNull()

    fireEvent.click(screen.getByRole('link', { name: 'Ir para o Trabalho' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1/reports'))
  })

  it('ligadas, a duração aparece e vai no salvar', async () => {
    dublê.ler.mockResolvedValue({ ...lido, SprintsEnabled: true })
    dublê.salvar.mockResolvedValue({ ...lido, SprintsEnabled: true, SprintLengthWeeks: 3 })
    montar()

    await screen.findByRole('combobox', { name: 'Cada sprint nasce com' })
    await escolherNoSelect(screen, fireEvent, 'Cada sprint nasce com', '3 semanas')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(dublê.salvar).toHaveBeenCalledWith('p-1', {
        ...lido,
        SprintsEnabled: true,
        SprintLengthWeeks: 3,
      }),
    )
    // Ja estavam ligadas: nao ha "Sprints ligadas" a anunciar.
    expect(screen.queryByText('Sprints ligadas.')).toBeNull()
  })

  it('desligar não avisa nem pede a conta: nada vai para lugar nenhum', async () => {
    dublê.ler.mockResolvedValue({ ...lido, SprintsEnabled: true })
    montar()

    fireEvent.click(await caixa())

    expect(screen.getByRole('region', { name: 'Alterações não salvas' })).toBeTruthy()
    expect(screen.queryByText(/em trabalho no quadro/)).toBeNull()
    expect(dublê.contar).not.toHaveBeenCalled()
  })

  it('falha ao carregar diz que nada mudou, e oferece tentar de novo', async () => {
    dublê.ler.mockRejectedValueOnce(new Error('rede'))
    montar()

    expect(await screen.findByText(/continua se comportando como estava/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await caixa()).toBeTruthy()
  })
})
