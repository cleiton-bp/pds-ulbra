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

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Ligar as sprints diz o que vai acontecer com o quadro, antes de salvar.** Com as
 * sprints, o quadro mostra so a sprint em andamento: o time ligava, salvava e
 * "perdia" os cards — que tinham ido para o Backlog. A frase conta os cards em
 * trabalho (as colunas que nao encerram) e so aparece quando ha algum; depois de
 * salvar, a tela mostra o caminho seguinte.
 *
 * **A escolha e entre duas formas de trabalhar, e a previa acompanha o rascunho.** Os
 * blocos "Quadro contínuo" e "Em sprints" sao radios de verdade; a tela de Trabalho de
 * mentira ganha a aba Backlog e os pontos no card com as sprints, e diz a duracao.
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

/** Os dois blocos da forma de trabalhar: radios do mesmo grupo. */
const emSprints = () => screen.findByRole('radio', { name: /Em sprints/ })
const continuo = () => screen.findByRole('radio', { name: /Quadro contínuo/ })

/** A duracao, em blocos de 1 a 4 semanas: so com as sprints ligadas. */
const duracoes = () => screen.queryByRole('radiogroup', { name: 'Cada sprint nasce com' })

/** A previa, a direita: tudo nela e de mentira, e segue o rascunho. */
const previa = () => screen.getByRole('region', { name: 'Como fica o Trabalho' })
const abas = () =>
  within(previa())
    .getAllByRole('listitem')
    .map((aba) => aba.textContent)

/** O Salvar mora no titulo, sempre a vista: liga so com o que salvar. */
const salvarLigado = () =>
  !(screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled

describe('SprintSettingsScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.ler.mockResolvedValue(lido)
    dublê.contar.mockResolvedValue([])
  })

  it('desligadas, a tela marca o quadro contínuo, sem a duração e com tudo salvo', async () => {
    montar()

    expect(((await continuo()) as HTMLInputElement).checked).toBe(true)
    expect(((await emSprints()) as HTMLInputElement).checked).toBe(false)
    expect(duracoes()).toBeNull()
    // A busca da configuracao leva ao grupo de escolha.
    expect(
      document.getElementById('sprints-ligadas')?.querySelector('[role="radiogroup"]'),
    ).toBeTruthy()
    expect(screen.getByText('Tudo salvo')).toBeTruthy()
    expect(salvarLigado()).toBe(false)
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

    fireEvent.click(await emSprints())

    const aviso = await screen.findByText(/Hoje há 7 cards em trabalho no quadro/)
    expect(aviso.textContent).toContain('eles vão para o Backlog')
    expect(dublê.contar).toHaveBeenCalledWith('p-1')
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('um card só: a frase no singular', async () => {
    dublê.contar.mockResolvedValue([contagem('s-1', 1)])
    montar()

    fireEvent.click(await emSprints())

    expect(await screen.findByText(/Hoje há 1 card em trabalho no quadro/)).toBeTruthy()
  })

  it('sem card em trabalho, não há o que avisar', async () => {
    dublê.contar.mockResolvedValue([contagem('s-3', 6, true)])
    montar()

    fireEvent.click(await emSprints())

    await waitFor(() => expect(dublê.contar).toHaveBeenCalled())
    expect(screen.queryByText(/em trabalho no quadro/)).toBeNull()
  })

  it('salvar manda o registro que leu, com só as sprints mudadas', async () => {
    dublê.salvar.mockResolvedValue({ ...lido, SprintsEnabled: true })
    montar()

    fireEvent.click(await emSprints())
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

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

    fireEvent.click(await emSprints())
    await screen.findByText(/Hoje há 2 cards/)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Sprints ligadas.')).toBeTruthy()
    // O aviso de antes sai: o que ele dizia ja aconteceu.
    expect(screen.queryByText(/Hoje há 2 cards/)).toBeNull()
    expect(salvarLigado()).toBe(false)

    fireEvent.click(screen.getByRole('link', { name: 'Ir para o Trabalho' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1/reports'))
  })

  it('ligadas, a duração aparece e vai no salvar', async () => {
    dublê.ler.mockResolvedValue({ ...lido, SprintsEnabled: true })
    dublê.salvar.mockResolvedValue({ ...lido, SprintsEnabled: true, SprintLengthWeeks: 3 })
    montar()

    await emSprints()
    const grupo = duracoes()
    expect(grupo).toBeTruthy()
    const blocos = within(grupo as HTMLElement).getAllByRole('radio')
    expect(blocos.map((bloco) => bloco.closest('label')?.textContent)).toEqual([
      '1 semana',
      '2 semanas',
      '3 semanas',
      '4 semanas',
    ])
    expect(
      (within(grupo as HTMLElement).getByRole('radio', { name: '2 semanas' }) as HTMLInputElement)
        .checked,
    ).toBe(true)

    fireEvent.click(within(grupo as HTMLElement).getByRole('radio', { name: '3 semanas' }))
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

    fireEvent.click(await continuo())

    expect(salvarLigado()).toBe(true)
    expect(screen.queryByText(/em trabalho no quadro/)).toBeNull()
    expect(dublê.contar).not.toHaveBeenCalled()
  })

  it('falha ao carregar diz que nada mudou, e oferece tentar de novo', async () => {
    dublê.ler.mockRejectedValueOnce(new Error('rede'))
    montar()

    expect(await screen.findByText(/continua se comportando como estava/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await emSprints()).toBeTruthy()
  })

  it('a prévia segue o rascunho: Backlog, pontos e a duração só com as sprints', async () => {
    montar()
    await continuo()

    // Quadro continuo: uma aba so, card sem pontos, e nada de duracao.
    expect(abas()).toEqual(['Quadro'])
    expect(within(previa()).queryByText('3 pontos')).toBeNull()
    expect(within(previa()).queryByText(/A sprint dura/)).toBeNull()
    expect(within(previa()).getByText('igual ao salvo')).toBeTruthy()

    fireEvent.click(await emSprints())

    expect(abas()).toEqual(['Quadro', 'Backlog'])
    expect(within(previa()).getByText('3 pontos')).toBeTruthy()
    expect(within(previa()).getByText('A sprint dura 2 semanas.')).toBeTruthy()
    expect(within(previa()).getByText('ainda não salvo')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: '4 semanas' }))
    expect(within(previa()).getByText('A sprint dura 4 semanas.')).toBeTruthy()

    // Voltar ao quadro continuo tira tudo de novo, sem salvar nada.
    fireEvent.click(await continuo())
    expect(abas()).toEqual(['Quadro'])
    expect(duracoes()).toBeNull()
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('o resumo do grupo diz a escolha em palavras, e "Voltar ao padrão" volta ao contínuo', async () => {
    dublê.ler.mockResolvedValue({ ...lido, SprintsEnabled: true, SprintLengthWeeks: 3 })
    montar()

    expect(await screen.findByText('Em sprints de 3 semanas')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao padrão' }))

    expect(((await continuo()) as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()
    expect(salvarLigado()).toBe(true)
  })
})
