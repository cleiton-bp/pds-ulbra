// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaSettingsViewModel, ProjectViewModel } from '@/contracts'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { MediaScreen } from '@/features/media/MediaScreen'
import { actAsPreviewFrame, lastPreview } from '@/test/previewFrame'

/**
 * O QUE ESTES TESTES TRAVAM: os grupos de Anexos e a previa.
 *
 * - **Cada grupo, fechado, diz em palavras o que esta escolhido** (Imagem, Arquivo,
 *   Quando anexar) e o que saiu do padrao de fabrica, com os nomes da tela.
 * - **Cada grupo tem o proprio "Voltar ao padrão"**, que volta so os campos dele, no
 *   rascunho: os outros grupos e a chave geral ficam, e quem grava e o Publicar.
 * - **A previa recebe o rascunho dos anexos** como a ferramenta o le: so os tipos ligados,
 *   o arquivo com as extensoes marcadas. Desligado o anexo, nada de anexo.
 * - **A previa abre o formulario e contorna a area de anexar** enquanto um grupo esta
 *   aberto ou em foco.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<MediaSettingsViewModel>>(),
  salvar: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  const { DEFAULT_WIDGET_SETTINGS: padrao } = await import('@/embed/settings')

  return {
    ...real,
    // A previa so desenha o quadro com a ferramenta na mesma origem do painel.
    environment: { ...real.environment, embedUrl: `${window.location.origin}/embed.html` },
    projectMediaSettingsService: {
      getMediaSettings: dublê.ler,
      saveMediaSettings: dublê.salvar,
    },
    projectWidgetSettingsService: {
      getWidgetSettings: async () => padrao,
      saveWidgetSettings: async () => padrao,
    },
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

const MB = 1024 * 1024

/** O de fabrica, como a API devolve para projeto que nunca salvou nada. */
const FABRICA: MediaSettingsViewModel = {
  IsStorageAvailable: true,
  IsEnabled: true,
  AllowsScreenCapture: true,
  AllowsOnInfoRequest: true,
  AllowsOnReopen: true,
  Kinds: [
    { Kind: 'Image', IsEnabled: true, MaxCount: 3, MaxBytes: 5 * MB, Formats: [] },
    { Kind: 'File', IsEnabled: false, MaxCount: 2, MaxBytes: 10 * MB, Formats: ['pdf', 'text'] },
  ],
  FileFormats: [
    { Key: 'pdf', IsDefault: true, Extensions: ['.pdf'] },
    { Key: 'text', IsDefault: true, Extensions: ['.txt', '.log'] },
    { Key: 'json', IsDefault: false, Extensions: ['.json'] },
  ],
}

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ project: projeto }} />,
        children: [{ index: true, element: <MediaScreen /> }],
      },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

const carregada = () => screen.findByRole('checkbox', { name: 'Aceitar anexos' })
const caixa = (nome: string | RegExp) =>
  screen.getByRole('checkbox', { name: nome }) as HTMLInputElement
const numero = (id: string) => document.getElementById(id) as HTMLInputElement
/** O grupo do acordeao: a ancora fica no `<summary>`. */
const grupo = (id: string) => document.getElementById(id)?.closest('details') as HTMLDetailsElement
/** A secao em volta do grupo: o "Voltar ao padrão" mora nela, fora do `<summary>`. */
const secao = (id: string) => grupo(id).closest('section') as HTMLElement
const resumoDo = (id: string) => grupo(id).querySelector('summary')?.textContent ?? ''
const voltarAoPadrao = (id: string) =>
  within(secao(id)).getByRole('button', { name: 'Voltar ao padrão' })

describe('MediaScreen — grupos e prévia', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.ler.mockReset()
    dublê.salvar.mockReset()
  })

  it('cada grupo diz o que está escolhido em palavras, e nada de "Mudou" no padrão', async () => {
    dublê.ler.mockResolvedValue(FABRICA)
    montar()
    await carregada()

    expect(resumoDo('grupo-imagem')).toBe('ImagemAceita · até 3 de 5 MB · captura ligada')
    expect(resumoDo('grupo-arquivo')).toBe('ArquivoDesligado')
    expect(resumoDo('quando-anexar')).toBe('Quando anexarNo relato · ao responder · ao reabrir')
    for (const id of ['grupo-imagem', 'grupo-arquivo', 'quando-anexar']) {
      expect(resumoDo(id)).not.toContain('Mudou')
      expect(within(secao(id)).queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()
    }

    // O resumo acompanha o rascunho.
    fireEvent.click(caixa('Aceitar arquivo'))
    fireEvent.click(caixa('Deixar capturar a tela'))
    fireEvent.click(caixa('Ao responder o time'))

    expect(resumoDo('grupo-arquivo')).toContain('PDF, Texto e log · até 2 de 10 MB')
    expect(resumoDo('grupo-imagem')).toContain('captura desligada')
    expect(resumoDo('quando-anexar')).toContain('No relato · ao reabrir')
    expect(resumoDo('quando-anexar')).not.toContain('ao responder')
  })

  it('o "Mudou" de cada grupo diz só o que é dele, com os nomes da tela', async () => {
    dublê.ler.mockResolvedValue({
      ...FABRICA,
      AllowsScreenCapture: false,
      AllowsOnReopen: false,
      Kinds: [
        { Kind: 'Image', IsEnabled: true, MaxCount: 6, MaxBytes: 5 * MB, Formats: [] },
        { Kind: 'File', IsEnabled: true, MaxCount: 2, MaxBytes: 20 * MB, Formats: ['json'] },
      ],
    })
    montar()
    await carregada()

    expect(resumoDo('grupo-imagem')).toContain('Mudou: Quantas imagens, Captura da tela')
    expect(resumoDo('grupo-arquivo')).toContain(
      'Mudou: Aceitar arquivo, Formatos, Tamanho do arquivo',
    )
    expect(resumoDo('quando-anexar')).toContain('Mudou: Ao reabrir')
  })

  it('"Voltar ao padrão" de um grupo volta só os campos dele, no rascunho', async () => {
    dublê.ler.mockResolvedValue({
      ...FABRICA,
      AllowsScreenCapture: false,
      AllowsOnReopen: false,
      Kinds: [
        { Kind: 'Image', IsEnabled: true, MaxCount: 6, MaxBytes: 5 * MB, Formats: [] },
        { Kind: 'File', IsEnabled: true, MaxCount: 2, MaxBytes: 20 * MB, Formats: ['json'] },
      ],
    })
    montar()
    await carregada()

    // Imagem: a quantidade e a captura voltam; o arquivo e o Quando anexar ficam.
    fireEvent.click(voltarAoPadrao('grupo-imagem'))
    expect(numero('quantidade-Image').value).toBe('3')
    expect(caixa('Deixar capturar a tela').checked).toBe(true)
    expect(resumoDo('grupo-imagem')).not.toContain('Mudou')
    expect(caixa('Aceitar arquivo').checked).toBe(true)
    expect(caixa('Ao reabrir').checked).toBe(false)

    // Arquivo: aceitar, os formatos de fabrica (os `IsDefault` do catalogo) e o tamanho.
    fireEvent.click(voltarAoPadrao('grupo-arquivo'))
    expect(caixa('Aceitar arquivo').checked).toBe(false)
    expect(caixa(/^PDF/).checked).toBe(true)
    expect(caixa(/^Texto e log/).checked).toBe(true)
    expect(caixa(/^JSON/).checked).toBe(false)
    expect(numero('tamanho-File').value).toBe('10')
    expect(resumoDo('grupo-arquivo')).toBe('ArquivoDesligado')
    expect(caixa('Ao reabrir').checked).toBe(false)

    // Quando anexar: os dois lugares a mais. A chave geral nao e de grupo nenhum.
    fireEvent.click(voltarAoPadrao('quando-anexar'))
    expect(caixa('Ao reabrir').checked).toBe(true)
    expect(caixa('Aceitar anexos').checked).toBe(true)

    // Fica no rascunho: e o Publicar do titulo que grava.
    expect(dublê.salvar).not.toHaveBeenCalled()
    expect(screen.getByText('Mudanças não publicadas')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('"Voltar ao padrão" também troca o texto de um campo a corrigir no grupo', async () => {
    dublê.ler.mockResolvedValue({
      ...FABRICA,
      AllowsScreenCapture: false,
    })
    montar()
    await carregada()

    // O rascunho ja tem o 3 de fabrica: so o texto do campo esta errado.
    fireEvent.change(numero('quantidade-Image'), { target: { value: '' } })
    expect(resumoDo('grupo-imagem')).toContain('corrigir')

    fireEvent.click(voltarAoPadrao('grupo-imagem'))

    expect(numero('quantidade-Image').value).toBe('3')
    expect(numero('quantidade-Image').getAttribute('aria-invalid')).toBeNull()
    await waitFor(() => expect(resumoDo('grupo-imagem')).not.toContain('corrigir'))
    expect(screen.queryByText(/campos? a corrigir/)).toBeNull()
  })

  it('a prévia recebe o rascunho dos anexos, como a ferramenta o lê', async () => {
    dublê.ler.mockResolvedValue(FABRICA)
    montar()

    await carregada()
    const lidas = actAsPreviewFrame()

    await waitFor(() =>
      expect(lastPreview(lidas)?.media?.Kinds.map((tipo) => tipo.Kind)).toEqual(['Image']),
    )
    expect(lastPreview(lidas)?.settings.Title).toBe(DEFAULT_WIDGET_SETTINGS.Title)

    // Aceitar arquivo: ele entra, com as extensoes dos formatos marcados.
    fireEvent.click(caixa('Aceitar arquivo'))
    await waitFor(() =>
      expect(
        lastPreview(lidas)
          ?.media?.Kinds.find((tipo) => tipo.Kind === 'File')
          ?.Types?.map((tipo) => tipo.Extension),
      ).toEqual(['.pdf', '.txt', '.log']),
    )

    // Desligar o anexo: a ferramenta nao mostra nada de anexo, e a previa tambem nao.
    fireEvent.click(caixa('Aceitar anexos'))
    await waitFor(() => expect(lastPreview(lidas)?.media).toBeNull())
  })

  it('a prévia contorna a área de anexar enquanto um grupo está aberto ou em foco', async () => {
    dublê.ler.mockResolvedValue(FABRICA)
    montar()

    await carregada()
    const lidas = actAsPreviewFrame()

    // A Imagem abre sozinha, e a previa ja contorna a area de anexar.
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBe('form-attachments'))

    grupo('grupo-imagem').open = false
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBeNull())

    // O foco num campo de um grupo fechado tambem realca.
    act(() => caixa('Ao reabrir').focus())
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBe('form-attachments'))

    act(() => (document.activeElement as HTMLElement).blur())
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBeNull())
  })
})
