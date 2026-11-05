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
 * - **Cada grupo, fechado, diz em palavras o que esta escolhido** (Print da tela, Arquivos,
 *   Quando anexar) e o que saiu do padrao de fabrica, com os nomes da tela. Quantidade e
 *   tamanho nao sao da tela, e nao entram no "Mudou".
 * - **Cada grupo tem o proprio "Voltar ao padrão"**, que volta so os campos dele, no
 *   rascunho: os outros grupos e a chave geral ficam, e quem grava e o Publicar.
 * - **A previa recebe o rascunho dos anexos** como a ferramenta o le: so os tipos ligados,
 *   o arquivo com as extensoes marcadas. Desligado o anexo, nada de anexo.
 * - **A previa abre o formulario e contorna a area de anexar** enquanto um grupo esta
 *   aberto, e so entao: o foco atravessando um grupo fechado nao muda nada.
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
/** O grupo do acordeao: a ancora fica no `<summary>`. */
const grupo = (id: string) => document.getElementById(id)?.closest('details') as HTMLDetailsElement
/** A secao em volta do grupo: o "Voltar ao padrão" mora nela, fora do `<summary>`. */
const secao = (id: string) => grupo(id).closest('section') as HTMLElement
const resumoDo = (id: string) => grupo(id).querySelector('summary')?.textContent ?? ''
const voltarAoPadrao = (id: string) =>
  within(secao(id)).getByRole('button', { name: 'Voltar ao padrão' })

describe('MediaScreen, grupos e prévia', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.ler.mockReset()
    dublê.salvar.mockReset()
  })

  it('cada grupo diz o que está escolhido em palavras, e nada de "Mudou" no padrão', async () => {
    dublê.ler.mockResolvedValue(FABRICA)
    montar()
    await carregada()

    expect(resumoDo('grupo-imagem')).toBe('Print da telaAceito, abre no editor')
    expect(resumoDo('grupo-arquivo')).toBe('ArquivosImagem')
    expect(resumoDo('quando-anexar')).toBe('Quando anexarNo relato, ao responder, ao reabrir')
    for (const id of ['grupo-imagem', 'grupo-arquivo', 'quando-anexar']) {
      expect(resumoDo(id)).not.toContain('Mudou')
      expect(within(secao(id)).queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()
    }

    // O resumo acompanha o rascunho, sem quantidade nem tamanho.
    fireEvent.click(caixa(/^PDF/))
    fireEvent.click(caixa('Aceitar print da tela'))
    fireEvent.click(caixa('Ao responder o time'))

    expect(resumoDo('grupo-arquivo')).toBe('ArquivosImagem, PDFMudou: Tipos de arquivo')
    expect(resumoDo('grupo-imagem')).toContain('Desligado')
    expect(resumoDo('quando-anexar')).toContain('No relato, ao reabrir')
    expect(resumoDo('quando-anexar')).not.toContain('ao responder')
  })

  it('o "Mudou" de cada grupo diz só o que é dele, com os nomes da tela', async () => {
    dublê.ler.mockResolvedValue({
      ...FABRICA,
      AllowsScreenCapture: false,
      AllowsOnReopen: false,
      Kinds: [
        // Limites fora do de fabrica nao aparecem: nao sao da tela.
        { Kind: 'Image', IsEnabled: false, MaxCount: 6, MaxBytes: 5 * MB, Formats: [] },
        { Kind: 'File', IsEnabled: true, MaxCount: 2, MaxBytes: 20 * MB, Formats: ['json'] },
      ],
    })
    montar()
    await carregada()

    expect(resumoDo('grupo-imagem')).toContain('Mudou: Aceitar print da tela')
    expect(resumoDo('grupo-arquivo')).toContain('Mudou: Tipos de arquivo')
    expect(resumoDo('quando-anexar')).toContain('Mudou: Ao reabrir')
    expect(resumoDo('grupo-imagem') + resumoDo('grupo-arquivo')).not.toMatch(/Quant|Tamanho|MB/)
  })

  it('"Voltar ao padrão" de um grupo volta só os campos dele, no rascunho', async () => {
    dublê.ler.mockResolvedValue({
      ...FABRICA,
      AllowsScreenCapture: false,
      AllowsOnReopen: false,
      Kinds: [
        { Kind: 'Image', IsEnabled: false, MaxCount: 3, MaxBytes: 5 * MB, Formats: [] },
        { Kind: 'File', IsEnabled: true, MaxCount: 2, MaxBytes: 20 * MB, Formats: ['json'] },
      ],
    })
    montar()
    await carregada()

    // Print da tela: volta aceito; os tipos do botao e o Quando anexar ficam.
    fireEvent.click(voltarAoPadrao('grupo-imagem'))
    expect(caixa('Aceitar print da tela').checked).toBe(true)
    expect(resumoDo('grupo-imagem')).not.toContain('Mudou')
    expect(caixa(/^Imagem/).checked).toBe(false)
    expect(caixa(/^JSON/).checked).toBe(true)
    expect(caixa('Ao reabrir').checked).toBe(false)

    // Arquivos: a imagem de volta no botao, e os formatos de arquivo desmarcados.
    fireEvent.click(voltarAoPadrao('grupo-arquivo'))
    expect(caixa(/^Imagem/).checked).toBe(true)
    expect(caixa(/^PDF/).checked).toBe(false)
    expect(caixa(/^JSON/).checked).toBe(false)
    expect(resumoDo('grupo-arquivo')).toBe('ArquivosImagem')
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

  it('a prévia recebe o rascunho dos anexos, como a ferramenta o lê', async () => {
    dublê.ler.mockResolvedValue(FABRICA)
    montar()

    await carregada()
    const lidas = actAsPreviewFrame()

    await waitFor(() =>
      expect(lastPreview(lidas)?.media?.Kinds.map((tipo) => tipo.Kind)).toEqual(['Image']),
    )
    expect(lastPreview(lidas)?.settings.Title).toBe(DEFAULT_WIDGET_SETTINGS.Title)

    // Marcar um formato: o arquivo entra no botao, com as extensoes dele.
    fireEvent.click(caixa(/^PDF/))
    await waitFor(() =>
      expect(
        lastPreview(lidas)
          ?.media?.Kinds.find((tipo) => tipo.Kind === 'File')
          ?.Types?.map((tipo) => tipo.Extension),
      ).toEqual(['.pdf']),
    )

    // Sem o print, a imagem continua no botao, e so a captura sai.
    fireEvent.click(caixa('Aceitar print da tela'))
    await waitFor(() => expect(lastPreview(lidas)?.media?.AllowsScreenCapture).toBe(false))
    expect(lastPreview(lidas)?.media?.Kinds.map((tipo) => tipo.Kind)).toEqual(['Image', 'File'])

    // Com o print de volta e a imagem fora do botao, ela fica so para o print.
    fireEvent.click(caixa('Aceitar print da tela'))
    fireEvent.click(caixa(/^Imagem/))
    await waitFor(() =>
      expect(lastPreview(lidas)?.media?.Kinds.find((tipo) => tipo.Kind === 'Image')?.InPicker).toBe(
        false,
      ),
    )

    // Desligar o anexo: a ferramenta nao mostra nada de anexo, e a previa tambem nao.
    fireEvent.click(caixa('Aceitar anexos'))
    await waitFor(() => expect(lastPreview(lidas)?.media).toBeNull())
  })

  it('a prévia contorna a área de anexar enquanto um grupo está aberto, e só então', async () => {
    dublê.ler.mockResolvedValue(FABRICA)
    montar()

    await carregada()
    const lidas = actAsPreviewFrame()

    // O Print da tela abre sozinho, e a previa ja contorna a area de anexar.
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBe('form-attachments'))

    grupo('grupo-imagem').open = false
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBeNull())

    // O foco num campo de um grupo fechado nao muda nada.
    act(() => caixa('Ao reabrir').focus())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(lastPreview(lidas)?.highlight).toBeNull()

    // Abrir o grupo, sim.
    grupo('quando-anexar').open = true
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBe('form-attachments'))
  })
})
