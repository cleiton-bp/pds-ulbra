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
 * **A duracao do video gravado vem do relogio.** Video gravado pelo navegador sai
 * sem duracao no cabecalho; se a tela tentasse le-la do arquivo, o anexo ficaria
 * esperando para sempre.
 */
const dublê = vi.hoisted(() => ({
  capturar: vi.fn(),
  gravar: vi.fn(),
  cortar: vi.fn(),
  podeCapturar: vi.fn(() => true),
  podeGravar: vi.fn(() => true),
}))

vi.mock('@/embed/screenCapture', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/embed/screenCapture')>()
  return {
    ...real,
    canCaptureScreen: dublê.podeCapturar,
    canRecordScreen: dublê.podeGravar,
    captureFrame: dublê.capturar,
    recordScreen: dublê.gravar,
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
    MaxFilesPerReport: 4,
    Kinds: [
      {
        Kind: 'Image',
        MaxCount: 3,
        MaxBytes: 5 * 1024 * 1024,
        MaxDurationSeconds: null,
        ContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
      },
      {
        Kind: 'Video',
        MaxCount: 1,
        MaxBytes: 20 * 1024 * 1024,
        MaxDurationSeconds: 60,
        ContentTypes: ['video/webm'],
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
  dublê.podeGravar.mockReturnValue(true)
  // jsdom nao desenha canvas; a previa do recorte so precisa de um endereco.
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA'
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('onde o botao aparece', () => {
  it('com tudo deixando, aparecem capturar e gravar', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Capturar tela' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Gravar tela' })).toBeDefined()
  })

  it('o projeto desligou a captura: nenhum dos dois', () => {
    montar(media({ AllowsScreenCapture: false }))
    expect(screen.queryByRole('button', { name: 'Capturar tela' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Gravar tela' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anexar arquivo' })).toBeDefined()
  })

  it('navegador sem captura, como o do iPhone: nenhum dos dois, e anexar continua', () => {
    dublê.podeCapturar.mockReturnValue(false)
    dublê.podeGravar.mockReturnValue(false)
    montar()
    expect(screen.queryByRole('button', { name: 'Capturar tela' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anexar arquivo' })).toBeDefined()
  })

  it('projeto sem video aceito: captura sim, gravacao nao', () => {
    const soImagem = media()
    montar({ ...soImagem, Kinds: soImagem.Kinds.filter((kind) => kind.Kind === 'Image') })
    expect(screen.getByRole('button', { name: 'Capturar tela' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Gravar tela' })).toBeNull()
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
  })

  it('a pagina proibir some com o botao, e diz para anexar arquivo', async () => {
    dublê.capturar.mockRejectedValue(
      Object.assign(new Error('Permission denied by permissions policy'), {
        name: 'NotAllowedError',
      }),
    )
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))

    await screen.findByText(/Este site não permite capturar a tela/)
    expect(screen.queryByRole('button', { name: 'Capturar tela' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anexar arquivo' })).toBeDefined()
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

describe('a gravacao', () => {
  function gravacaoControlada() {
    let terminar: (valor: { file: File; durationSeconds: number }) => void = () => {}
    const done = new Promise<{ file: File; durationSeconds: number }>((resolve) => {
      terminar = resolve
    })
    const stop = vi.fn()
    return { controle: { stop, done }, terminar, stop }
  }

  it('mostra o contador, trava o envio, e para no botao', async () => {
    const { controle, stop } = gravacaoControlada()
    dublê.gravar.mockResolvedValue(controle)
    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'olha o que acontece' } })

    fireEvent.click(screen.getByRole('button', { name: 'Gravar tela' }))

    await screen.findByText(/Gravando 0:00 de 1:00/)
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Parar' }))
    expect(stop).toHaveBeenCalledOnce()
  })

  it('grava com o teto e a duracao do projeto', async () => {
    dublê.gravar.mockResolvedValue(gravacaoControlada().controle)
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Gravar tela' }))

    await waitFor(() => expect(dublê.gravar).toHaveBeenCalled())
    expect(dublê.gravar.mock.calls[0]?.[0]).toMatchObject({
      maxSeconds: 60,
      maxBytes: 20 * 1024 * 1024,
    })
  })

  it('o video pronto vira anexo, com a duracao do relogio', async () => {
    const { controle, terminar } = gravacaoControlada()
    dublê.gravar.mockResolvedValue(controle)
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Gravar tela' }))
    await screen.findByText(/Gravando/)

    await act(async () => {
      terminar({
        file: new File([new Uint8Array(100)], 'gravacao.webm', { type: 'video/webm' }),
        durationSeconds: 12,
      })
    })

    // Se a duracao fosse lida do arquivo, isto nunca apareceria: o jsdom nao le
    // video. A miniatura do video tambem nao sai aqui — e o prazo da leitura que
    // deixa o anexo seguir sem ela, por isso a espera maior.
    await screen.findByRole('button', { name: 'Remover gravacao.webm' }, { timeout: 6000 })
    expect(screen.queryByText(/Gravando/)).toBeNull()
  }, 10_000)
})
