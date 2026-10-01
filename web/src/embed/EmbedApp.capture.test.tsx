// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import { EmbedApp } from '@/embed/EmbedApp'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O botao so aparece onde vai funcionar.** Configuracao do projeto, navegador e
 * pagina precisam deixar, os tres. Botao que falha no clique e pior do que botao
 * que nao existe — e anexar arquivo continua em todos os casos.
 *
 * **A proibicao da pagina some com o botao; desistir, nao.** As duas chegam como a
 * mesma recusa do navegador. So a primeira e permanente.
 *
 * **O recorte cresce o quadro e o devolve.** E o texto que a pessoa ja tinha escrito
 * volta intacto quando ela sai do recorte.
 *
 * **Nao ha gravar tela.** O video saiu do produto, e a captura e o unico botao
 * alem de anexar imagem.
 *
 * **Sem vaga para imagem, os dois botoes desligam.** O padrao de fabrica e quatro
 * no total e tres imagens; conferindo so o total, capturar ficaria ligado depois
 * da terceira, e a recusa so viria depois de a pessoa recortar a tela.
 */
const dublê = vi.hoisted(() => ({
  capturar: vi.fn(),
  cortar: vi.fn(),
  podeCapturar: vi.fn(() => true),
  criar: vi.fn(),
}))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return { ...real, reportService: { createReport: dublê.criar } }
})

vi.mock('@/embed/screenCapture', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/embed/screenCapture')>()
  return {
    ...real,
    canCaptureScreen: dublê.podeCapturar,
    captureFrame: dublê.capturar,
    cropToFile: dublê.cortar,
  }
})

const config = {
  key: 'pk_DEMO',
  route: '/checkout',
  origin: 'loja.exemplo.com',
  viewport: '1280x800',
}
const pagina = {
  init: null,
  show: vi.fn(),
  expand: vi.fn(),
  collapse: vi.fn(),
  enlarge: vi.fn(),
  stop: vi.fn(),
}

function media(mudanca: Partial<PublicMediaSettingsViewModel> = {}): PublicMediaSettingsViewModel {
  return {
    IsEnabled: true,
    AllowsScreenCapture: true,
    AllowsOnInfoRequest: true,
    AllowsOnReopen: true,
    MaxFilesPerReport: 4,
    Kinds: [
      {
        Kind: 'Image',
        MaxCount: 3,
        MaxBytes: 5 * 1024 * 1024,
        ContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
      },
    ],
    ...mudanca,
  }
}

function montar(m: PublicMediaSettingsViewModel = media()) {
  render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={pagina} media={m} />)
  // Dentro de uma pagina o quadro nasce recolhido.
  fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
}

beforeEach(() => {
  dublê.podeCapturar.mockReturnValue(true)
  // jsdom nao desenha canvas; a previa do recorte so precisa de um endereco.
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA'
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('onde o botao aparece', () => {
  it('com tudo deixando, aparece capturar, e so ele', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Capturar tela' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Gravar tela' })).toBeNull()
  })

  // A configuracao ainda pode listar video na janela da troca, e o navegador de
  // verdade sabe gravar. Os dois juntos eram o que fazia o botao aparecer; sem eles,
  // a ausencia do botao nao provaria nada.
  it('mesmo com video na configuracao e navegador que grava, nao ha gravar tela', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true })
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getDisplayMedia: vi.fn() },
      configurable: true,
    })

    try {
      montar(
        media({
          Kinds: [
            ...media().Kinds,
            {
              Kind: 'Video',
              MaxCount: 1,
              MaxBytes: 20 * 1024 * 1024,
              ContentTypes: ['video/webm'],
            },
          ],
        }),
      )

      expect(screen.getByRole('button', { name: 'Capturar tela' })).toBeDefined()
      expect(screen.queryByRole('button', { name: /Gravar/ })).toBeNull()
    } finally {
      vi.unstubAllGlobals()
      Reflect.deleteProperty(navigator, 'mediaDevices')
    }
  })

  it('o projeto desligou a captura: o botao some, e anexar continua', () => {
    montar(media({ AllowsScreenCapture: false }))
    expect(screen.queryByRole('button', { name: 'Capturar tela' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toBeDefined()
  })

  it('navegador sem captura, como o do iPhone: o botao some, e anexar continua', () => {
    dublê.podeCapturar.mockReturnValue(false)
    montar()
    expect(screen.queryByRole('button', { name: 'Capturar tela' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toBeDefined()
  })
})

describe('sem vaga para imagem', () => {
  it('com quatro no total e tres imagens, os dois botoes desligam na terceira', async () => {
    montar()
    const imagem = (nome: string) => new File([new Uint8Array(100)], nome, { type: 'image/png' })

    fireEvent.change(screen.getByLabelText('Escolher imagem para anexar'), {
      target: { files: [imagem('a.png'), imagem('b.png'), imagem('c.png')] },
    })

    await screen.findByRole('button', { name: 'Remover c.png' })
    const anexar = screen.getByRole('button', { name: 'Anexar imagem' }) as HTMLButtonElement
    const capturar = screen.getByRole('button', { name: 'Capturar tela' }) as HTMLButtonElement
    expect(anexar.disabled).toBe(true)
    expect(capturar.disabled).toBe(true)

    // Tirar uma devolve a vaga aos dois.
    fireEvent.click(screen.getByRole('button', { name: 'Remover c.png' }))
    expect(anexar.disabled).toBe(false)
    expect(capturar.disabled).toBe(false)
  })
})

describe('a captura', () => {
  it('abre o recorte num quadro maior', async () => {
    dublê.capturar.mockResolvedValue(document.createElement('canvas'))
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))

    await screen.findByText('Escolha o pedaço')
    expect(pagina.enlarge).toHaveBeenCalledOnce()
  })

  it('cancelar devolve o quadro ao tamanho de antes, com o texto intacto', async () => {
    dublê.capturar.mockResolvedValue(document.createElement('canvas'))
    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o botão sumiu' } })
    pagina.expand.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(pagina.expand).toHaveBeenCalledOnce()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('o botão sumiu')
  })

  it('usar a tela inteira vira anexo', async () => {
    dublê.capturar.mockResolvedValue(document.createElement('canvas'))
    dublê.cortar.mockResolvedValue(
      new File([new Uint8Array(100)], 'captura.png', { type: 'image/png' }),
    )
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Usar a tela inteira' }))

    await screen.findByRole('button', { name: 'Remover captura.png' })
    // O teto de imagem do projeto chega ao recorte: e com ele que, sem WebP, o PNG
    // grande vira JPEG em vez de ser recusado depois.
    expect(dublê.cortar.mock.calls[0]?.[2]).toBe(5 * 1024 * 1024)
  })

  // Gerar a imagem de uma tela grande leva ate segundos. Cancelar nesse meio tem de
  // cancelar: a imagem pronta depois nao entra no formulario.
  it('cancelar enquanto a imagem é gerada não anexa nada', async () => {
    let pronto: (arquivo: File) => void = () => {}
    dublê.capturar.mockResolvedValue(document.createElement('canvas'))
    dublê.cortar.mockImplementation(
      () =>
        new Promise<File>((resolve) => {
          pronto = resolve
        }),
    )
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Usar a tela inteira' }))
    await waitFor(() => expect(dublê.cortar).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await act(async () =>
      pronto(new File([new Uint8Array(100)], 'captura.png', { type: 'image/png' })),
    )

    expect(screen.queryByRole('button', { name: 'Remover captura.png' })).toBeNull()
  })

  // O relato saiu com a lista que tinha: a captura que volta depois nao iria junto,
  // e entraria na confirmacao como "na fila" para sempre.
  it('captura que volta depois de o relato sair não abre o recorte', async () => {
    let soltar: (canvas: HTMLCanvasElement) => void = () => {}
    dublê.capturar.mockImplementation(
      () =>
        new Promise<HTMLCanvasElement>((resolve) => {
          soltar = resolve
        }),
    )
    dublê.criar.mockResolvedValue({
      TrackingCode: '7K2M-9QXP-4TRV',
      AccessToken: 'tok-secreto',
      CreatedAt: '2026-09-23T12:00:00.000Z',
      ReporterCode: null,
    })
    montar()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o botão sumiu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await screen.findByText('7K2M-9QXP-4TRV')

    await act(async () => soltar(document.createElement('canvas')))

    expect(pagina.enlarge).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Usar a tela inteira' })).toBeNull()
  })

  // O navegador pergunta qual tela mostrar, e isso leva o tempo da pessoa. Fechado
  // o quadro nesse meio, a captura nao cresce o quadro nem entra no formulario novo.
  it('captura que chega depois de fechar o quadro não abre o recorte no formulário novo', async () => {
    let soltar: (canvas: HTMLCanvasElement) => void = () => {}
    dublê.capturar.mockImplementation(
      () =>
        new Promise<HTMLCanvasElement>((resolve) => {
          soltar = resolve
        }),
    )
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await act(async () => soltar(document.createElement('canvas')))

    expect(pagina.enlarge).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
    expect(screen.queryByRole('button', { name: 'Usar a tela inteira' })).toBeNull()
  })

  it('a pagina proibir some com o botao, e diz para anexar imagem', async () => {
    dublê.capturar.mockRejectedValue(
      Object.assign(new Error('Permission denied by permissions policy'), {
        name: 'NotAllowedError',
      }),
    )
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))

    await screen.findByText(/Este site não permite capturar a tela/)
    expect(screen.queryByRole('button', { name: 'Capturar tela' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toBeDefined()
  })

  it('a pessoa fechar o seletor nao e erro: o botao fica, e nada e dito', async () => {
    dublê.capturar.mockRejectedValue(
      Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }),
    )
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))

    await waitFor(() => expect(dublê.capturar).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Capturar tela' })).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
