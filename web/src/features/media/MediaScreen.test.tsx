// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaSettingsViewModel, ProjectViewModel } from '@/contracts'
import { MediaScreen } from '@/features/media/MediaScreen'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Sem armazenamento, o interruptor nao liga.** E a regra que o servidor tambem
 * cobra, e aqui ela existe para a pessoa nao descobrir o problema depois de
 * escolher um arquivo. Uma tela que deixasse marcar e so falhasse no `PUT`
 * passaria em qualquer teste de comportamento comum.
 *
 * **Ligado sem nenhum tipo aceito nao aceita nada**, e a tela nao liga um tipo
 * sozinha: cada tipo aceito e espaco que o projeto passa a guardar, e escolher
 * isso por quem configura seria decidir uma conta no lugar dele.
 *
 * **O banco guarda bytes, e quem configura pensa em MB.** A conversao mora na
 * borda, e o teste a trava nos dois sentidos — e ela que faz "5" virar 5242880 e
 * voltar como "5".
 *
 * **Tipo desligado mantem os limites visiveis.** Escondê-los faria parecer que
 * desligar apaga o que ja tinha sido pensado.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<MediaSettingsViewModel>>(),
  salvar: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectMediaSettingsService: {
      getMediaSettings: dublê.ler,
      saveMediaSettings: dublê.salvar,
    },
  }
})

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: '2026-08-01T12:00:00.000Z',
  UpdatedAt: '2026-08-01T12:00:00.000Z',
}

const UM_MB = 1024 * 1024

/** O padrao de fabrica, que e o que a API responde para quem nunca salvou nada. */
function padrao(mudanca: Partial<MediaSettingsViewModel> = {}): MediaSettingsViewModel {
  return {
    IsStorageAvailable: true,
    IsEnabled: true,
    AllowsScreenCapture: true,
    AllowsOnInfoRequest: true,
    MaxFilesPerReport: 4,
    Kinds: [
      {
        Kind: 'Image',
        IsEnabled: true,
        MaxCount: 3,
        MaxBytes: 5 * UM_MB,
        MaxDurationSeconds: null,
      },
      { Kind: 'Video', IsEnabled: true, MaxCount: 1, MaxBytes: 20 * UM_MB, MaxDurationSeconds: 60 },
    ],
    ...mudanca,
  }
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

const anexo = () => screen.getByRole('checkbox', { name: /Aceitar anexo no relato/ })
const salvar = () => screen.getByRole('button', { name: /Salvar/ })

describe('MediaScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.ler.mockResolvedValue(padrao())
  })

  it('desenha o padrão como configuração corrente, e não como ausência dela', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    expect((anexo() as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/Arquivos por relato/) as HTMLInputElement).value).toBe('4')
  })

  it('mostra o tamanho em MB, e não os bytes que o banco guarda', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    const tamanhos = screen.getAllByLabelText(/Tamanho de cada um/) as HTMLInputElement[]
    expect(tamanhos.map((campo) => campo.value)).toEqual(['5', '20'])
  })

  it('converte MB para bytes ao salvar', async () => {
    dublê.salvar.mockResolvedValue(padrao())
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    const imagem = screen.getAllByLabelText(/Tamanho de cada um/)[0] as HTMLInputElement
    fireEvent.change(imagem, { target: { value: '8' } })
    fireEvent.click(salvar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.Kinds[0]?.MaxBytes).toBe(8 * UM_MB)
  })

  it('sem armazenamento, o anexo não liga e a tela diz por quê', async () => {
    dublê.ler.mockResolvedValue(padrao({ IsStorageAvailable: false, IsEnabled: false }))
    montar()

    await screen.findByText(/Não há armazenamento configurado nesta instalação/)
    expect((anexo() as HTMLInputElement).disabled).toBe(true)
  })

  it('anexo ligado sem nenhum tipo aceito avisa, e não deixa salvar', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    fireEvent.click(screen.getByRole('checkbox', { name: /Imagem/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Vídeo de tela/ }))

    await screen.findByText(/O anexo está ligado e nenhum tipo é aceito/)
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)
  })

  it('desligar um tipo não esconde os limites dele', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })
    fireEvent.click(screen.getByRole('checkbox', { name: /Vídeo de tela/ }))

    expect(screen.getByLabelText(/Duração máxima/)).toBeDefined()
  })

  it('o botão só age quando há o que salvar', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/Arquivos por relato/), { target: { value: '2' } })
    expect((salvar() as HTMLButtonElement).disabled).toBe(false)
  })

  it('manda a configuração inteira, com os limites de cada tipo', async () => {
    dublê.salvar.mockResolvedValue(padrao({ MaxFilesPerReport: 2 }))
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })
    fireEvent.change(screen.getByLabelText(/Arquivos por relato/), { target: { value: '2' } })
    fireEvent.click(salvar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    expect(dublê.salvar).toHaveBeenCalledWith('p-1', {
      IsEnabled: true,
      AllowsScreenCapture: true,
      AllowsOnInfoRequest: true,
      MaxFilesPerReport: 2,
      Kinds: padrao().Kinds,
    })
  })

  it('diz que o limite de tamanho é cobrado pelo armazenamento, e não pelo navegador', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })
    expect(screen.getByText(/O limite de tamanho não é sugestão/)).toBeDefined()
  })
})
