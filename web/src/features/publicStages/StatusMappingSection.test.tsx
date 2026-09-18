// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectPublicStageViewModel,
  ProjectStatusMappingViewModel,
  ProjectViewModel,
  SaveStatusMappingRequest,
  StatusMappingEntryViewModel,
} from '@/contracts'
import { StatusMappingSection } from '@/features/publicStages/StatusMappingSection'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Estado sem destino nao vira linha.** A ausencia e a resposta. Mandar uma linha
 * apontando para nada criaria duas formas de dizer a mesma coisa, e um dia elas
 * discordariam — a regra e do lado da API, mas quem monta o pedido e a tela.
 *
 * **Dois estados podem apontar para a mesma etapa.** E o caminho normal, e nao uma
 * permissao: o dia em que alguem "corrigir" isto para um-para-um, a traducao perde
 * o sentido e vira renomear estado interno.
 *
 * **O botao so acende quando algo mudou.** Cada gravacao cria uma versao, e versao
 * que nasce igual a anterior parte a leitura do passado em pedacos identicos.
 *
 * **O aviso conta o rascunho, e nao o que esta gravado.** Desligar um estado e ler
 * "tudo mapeado" ate salvar seria a tela mentindo sobre o que esta prestes a
 * gravar.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<ProjectStatusMappingViewModel>>(),
  salvar: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectStatusMappingService: {
      getStatusMapping: dublê.ler,
      saveStatusMapping: dublê.salvar,
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

const ETAPAS = [etapa('e-1', 'Recebido', 0), etapa('e-2', 'Em correção', 1)]

function entrada(
  statePublicId: string,
  stateName: string,
  stagePublicId: string | null,
): StatusMappingEntryViewModel {
  return {
    StatePublicId: statePublicId,
    StateName: stateName,
    StateIsActive: true,
    StagePublicId: stagePublicId,
    StageLabel:
      stagePublicId === null
        ? null
        : (ETAPAS.find((e) => e.PublicId === stagePublicId)?.Label ?? null),
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
        children: [{ index: true, element: <StatusMappingSection etapas={ETAPAS} /> }],
      },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)
}

const botaoSalvar = () =>
  screen.getByRole('button', { name: 'Salvar mapeamento' }) as HTMLButtonElement

/** O corpo da primeira gravacao. Falha alto se nao houve gravacao nenhuma. */
function pedidoGravado(): SaveStatusMappingRequest {
  const chamada = dublê.salvar.mock.calls[0]
  if (!chamada) throw new Error('saveStatusMapping nao foi chamado')
  return chamada[1] as SaveStatusMappingRequest
}

instalarRemendosDoRadix()

describe('StatusMappingSection', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
  })

  it('deixa de fora do pedido o estado que não entra na jornada', async () => {
    dublê.ler.mockResolvedValue({
      Version: 3,
      Entries: [entrada('s-1', 'Análise', 'e-1'), entrada('s-2', 'Corrigindo', 'e-2')],
      UnmappedCount: 0,
    })
    dublê.salvar.mockResolvedValue({ Version: 4, Entries: [], UnmappedCount: 0 })

    montar()
    await screen.findByRole('combobox', { name: 'Onde o estado Corrigindo entra na jornada' })
    await escolherNoSelect(
      screen,
      fireEvent,
      'Onde o estado Corrigindo entra na jornada',
      'Não entra na jornada',
    )
    fireEvent.click(botaoSalvar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    // Só o que tem destino. Nada de `StagePublicId: null`.
    expect(pedidoGravado().Entries).toEqual([{ StatePublicId: 's-1', StagePublicId: 'e-1' }])
  })

  it('deixa dois estados apontarem para a mesma etapa', async () => {
    dublê.ler.mockResolvedValue({
      Version: 1,
      Entries: [entrada('s-1', 'Análise', 'e-1'), entrada('s-2', 'Corrigindo', 'e-2')],
      UnmappedCount: 0,
    })
    dublê.salvar.mockResolvedValue({ Version: 2, Entries: [], UnmappedCount: 0 })

    montar()
    await screen.findByRole('combobox', { name: 'Onde o estado Corrigindo entra na jornada' })
    await escolherNoSelect(
      screen,
      fireEvent,
      'Onde o estado Corrigindo entra na jornada',
      'Recebido',
    )
    fireEvent.click(botaoSalvar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    expect(pedidoGravado().Entries).toEqual([
      { StatePublicId: 's-1', StagePublicId: 'e-1' },
      { StatePublicId: 's-2', StagePublicId: 'e-1' },
    ])
  })

  it('só habilita salvar depois que alguma escolha muda', async () => {
    dublê.ler.mockResolvedValue({
      Version: 2,
      Entries: [entrada('s-1', 'Análise', 'e-1')],
      UnmappedCount: 0,
    })

    montar()
    await screen.findByRole('combobox', { name: 'Onde o estado Análise entra na jornada' })
    expect(botaoSalvar().disabled).toBe(true)

    await escolherNoSelect(
      screen,
      fireEvent,
      'Onde o estado Análise entra na jornada',
      'Em correção',
    )

    expect(botaoSalvar().disabled).toBe(false)
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('o aviso de estado sem jornada acompanha o que está escolhido, e não o que está gravado', async () => {
    dublê.ler.mockResolvedValue({
      Version: 1,
      Entries: [entrada('s-1', 'Análise', 'e-1')],
      UnmappedCount: 0,
    })

    montar()
    await screen.findByRole('combobox', { name: 'Onde o estado Análise entra na jornada' })
    expect(screen.queryByText(/ainda não entra na jornada/)).toBeNull()

    await escolherNoSelect(
      screen,
      fireEvent,
      'Onde o estado Análise entra na jornada',
      'Não entra na jornada',
    )

    expect(await screen.findByText(/ainda não entra na jornada/)).toBeTruthy()
  })
})
