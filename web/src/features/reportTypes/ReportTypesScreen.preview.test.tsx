// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReportTypeViewModel, ProjectViewModel } from '@/contracts'
import { ReportTypesScreen } from '@/features/reportTypes/ReportTypesScreen'
import { actAsPreviewFrame, lastPreview } from '@/test/previewFrame'

/**
 * O QUE ESTES TESTES TRAVAM: a previa de Tipos de relato, presa ao lado da lista, recebe
 * **o tipo aberto como esta escrito**, antes de salvar — e o formulario ja vem aberto e
 * marcado nele. Os outros tipos vem da lista, so os ativos, na ordem. Sem tipo aberto, o
 * marcado e o primeiro ativo; fechar o tipo volta a previa ao que esta salvo.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<() => Promise<ProjectReportTypeViewModel[]>>(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  const { DEFAULT_WIDGET_SETTINGS: padrao } = await import('@/embed/settings')

  return {
    ...real,
    // A previa so desenha o quadro com a ferramenta na mesma origem do painel.
    environment: { ...real.environment, embedUrl: `${window.location.origin}/embed.html` },
    projectReportTypeService: {
      ...real.projectReportTypeService,
      listReportTypes: dublê.listar,
    },
    projectStateService: { ...real.projectStateService, listProjectStates: async () => [] },
    projectWidgetSettingsService: {
      getWidgetSettings: async () => padrao,
      saveWidgetSettings: async () => padrao,
    },
  }
})

function tipo(
  publicId: string,
  name: string,
  extra: Partial<ProjectReportTypeViewModel> = {},
): ProjectReportTypeViewModel {
  return {
    PublicId: publicId,
    Name: name,
    Color: 'Gray',
    Icon: 'Other',
    Position: 0,
    IsActive: true,
    Questions: [],
    ShowsTextBox: true,
    TextBoxPrompt: 'Conte o que aconteceu.',
    InitialStatePublicId: null,
    CreatedAt: '2026-10-01T12:00:00.000Z',
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
        children: [{ index: true, element: <ReportTypesScreen /> }],
      },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

/** O cabecalho (`<summary>`) do tipo, pelo nome que ele mostra. */
const abrir = (nome: string) =>
  fireEvent.click(screen.getByText(nome, { selector: 'summary span' }))

describe('ReportTypesScreen — prévia', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.listar.mockReset()
    dublê.listar.mockResolvedValue([
      tipo('t-defeito', 'Defeito', { Questions: ['O que aconteceu?'], ShowsTextBox: false }),
      tipo('t-velho', 'Antigo', { IsActive: false }),
      tipo('t-duvida', 'Dúvida'),
    ])
  })

  it('mostra os ativos da lista, e o tipo aberto marcado, como está escrito agora', async () => {
    montar()
    await screen.findByText('Defeito', { selector: 'summary span' })
    const lidas = actAsPreviewFrame()

    await waitFor(() =>
      expect(lastPreview(lidas)?.settings.Types.map((item) => item.Name)).toEqual([
        'Defeito',
        'Dúvida',
      ]),
    )
    // Sem tipo aberto, o formulario marca o primeiro ativo.
    expect(lastPreview(lidas)?.settings.DefaultReportType).toBeNull()

    abrir('Dúvida')
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Pergunta' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar pergunta' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Pergunta 1' }), {
      target: { value: 'Em que tela?' },
    })

    await waitFor(() =>
      expect(lastPreview(lidas)?.settings.Types[1]).toMatchObject({
        PublicId: 't-duvida',
        Name: 'Pergunta',
        Questions: ['Em que tela?'],
      }),
    )
    // O formulario abre no tipo que se esta mudando.
    expect(lastPreview(lidas)?.settings.DefaultReportType).toBe('t-duvida')
    expect(screen.getByText('ainda não publicado')).toBeTruthy()

    // Desistir volta a previa ao que esta salvo.
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(lastPreview(lidas)?.settings.Types[1]?.Name).toBe('Dúvida'))
    expect(lastPreview(lidas)?.settings.Types[1]?.Questions).toEqual([])
    expect(lastPreview(lidas)?.settings.DefaultReportType).toBeNull()
    expect(screen.getByText('igual ao seu sistema')).toBeTruthy()
  })

  it('o tipo novo e o desativado aberto entram no fim, marcados', async () => {
    montar()
    await screen.findByText('Defeito', { selector: 'summary span' })
    const lidas = actAsPreviewFrame()

    fireEvent.click(screen.getByRole('button', { name: 'Novo tipo de relato' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Elogio' },
    })

    await waitFor(() =>
      expect(lastPreview(lidas)?.settings.Types.map((item) => item.Name)).toEqual([
        'Defeito',
        'Dúvida',
        'Elogio',
      ]),
    )
    expect(lastPreview(lidas)?.settings.DefaultReportType).toBe('novo')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    abrir('Antigo')

    await waitFor(() =>
      expect(lastPreview(lidas)?.settings.Types.map((item) => item.Name)).toEqual([
        'Defeito',
        'Dúvida',
        'Antigo',
      ]),
    )
    expect(lastPreview(lidas)?.settings.DefaultReportType).toBe('t-velho')
  })
})
