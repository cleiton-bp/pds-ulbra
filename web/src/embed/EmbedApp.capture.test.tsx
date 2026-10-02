// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import { EmbedApp } from '@/embed/EmbedApp'
import type { CaptureOutcome } from '@/embed/hostBridge'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **Quem captura e a pagina.** O quadro pede, a pagina esconde o quadro, deixa a
 * pessoa marcar a area e devolve a imagem — que abre no editor e, concluida, entra na
 * lista como um arquivo escolhido. Sem o navegador perguntar nada.
 *
 * **O botao so aparece onde vai funcionar.** A configuracao do projeto, uma vaga
 * para imagem e uma pagina que sabe capturar: o carregador antigo nao sabe, e o
 * quadro aberto direto — como no relato de teste do painel — nao tem pagina.
 * Anexar arquivo continua em todos os casos.
 *
 * **Desistir nao e erro; falhar diz o que fazer.** E a captura que volta depois de
 * o quadro mudar — fechado, ou com o relato ja enviado — nao entra.
 */
const dublê = vi.hoisted(() => ({ criar: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return { ...real, reportService: { createReport: dublê.criar } }
})

vi.mock('@/editor/ImageEditor', () => import('@/test/fakeImageEditor'))

const config = {
  key: 'pk_DEMO',
  route: '/checkout',
  origin: 'loja.exemplo.com',
  viewport: '1280x800',
}

/** A pagina: esconde o quadro, deixa marcar e devolve o que a pessoa escolheu. */
function pagina(canCapture = true) {
  return {
    init: null,
    show: vi.fn(),
    expand: vi.fn(),
    collapse: vi.fn(),
    enlarge: vi.fn(),
    canCapture,
    capture: vi.fn<(maxBytes: number | null) => Promise<CaptureOutcome>>(),
    stop: vi.fn(),
  }
}

function media(mudanca: Partial<PublicMediaSettingsViewModel> = {}): PublicMediaSettingsViewModel {
  return {
    IsEnabled: true,
    AllowsScreenCapture: true,
    AllowsOnInfoRequest: true,
    AllowsOnReopen: true,
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

function montar(host = pagina(), m: PublicMediaSettingsViewModel = media()) {
  render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={host} media={m} />)
  // Dentro de uma pagina o quadro nasce recolhido.
  fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
  return host
}

const captura = () => new File([new Uint8Array(100)], 'captura.webp', { type: 'image/webp' })

/** Uma captura que so termina quando o teste mandar. */
function segurar(host: ReturnType<typeof pagina>) {
  let terminar: (resultado: CaptureOutcome) => void = () => {}
  host.capture.mockImplementation(
    () =>
      new Promise<CaptureOutcome>((resolve) => {
        terminar = resolve
      }),
  )
  return (resultado: CaptureOutcome) => terminar(resultado)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('onde o botao aparece', () => {
  it('com tudo deixando, aparece capturar, e so ele', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Capturar tela' })).toBeDefined()
    expect(screen.queryByRole('button', { name: /Gravar/ })).toBeNull()
  })

  // A configuracao ainda pode listar video na janela da troca. Nem assim ha gravar.
  it('mesmo com video na configuracao, nao ha gravar tela', () => {
    montar(
      pagina(),
      media({
        Kinds: [
          ...media().Kinds,
          { Kind: 'Video', MaxCount: 1, MaxBytes: 20 * 1024 * 1024, ContentTypes: ['video/webm'] },
        ],
      }),
    )

    expect(screen.getByRole('button', { name: 'Capturar tela' })).toBeDefined()
    expect(screen.queryByRole('button', { name: /Gravar/ })).toBeNull()
  })

  it('o projeto desligou a captura: o botao some, e anexar continua', () => {
    montar(pagina(), media({ AllowsScreenCapture: false }))
    expect(screen.queryByRole('button', { name: 'Capturar tela' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toBeDefined()
  })

  it('carregador antigo, que nao sabe capturar: o botao some, e anexar continua', () => {
    montar(pagina(false))
    expect(screen.queryByRole('button', { name: 'Capturar tela' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toBeDefined()
  })

  it('aberto direto, sem pagina em volta: nao ha o que capturar', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} media={media()} />)
    expect(screen.queryByRole('button', { name: 'Capturar tela' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toBeDefined()
  })
})

describe('sem vaga para imagem', () => {
  it('com tres imagens por envio, os dois botoes desligam na terceira', async () => {
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
  it('pede a pagina, com o teto de imagem, e a imagem vira anexo depois do editor', async () => {
    const host = pagina()
    host.capture.mockResolvedValue({ outcome: 'file', file: captura() })
    montar(host)

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Concluir sem marcas' }))

    await screen.findByRole('button', { name: 'Remover captura.webp' })
    expect(host.capture).toHaveBeenCalledWith(5 * 1024 * 1024)
  })

  it('o texto escrito antes continua la quando a imagem volta', async () => {
    const host = pagina()
    host.capture.mockResolvedValue({ outcome: 'file', file: captura() })
    montar(host)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o botão sumiu' } })

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Concluir sem marcas' }))

    await screen.findByRole('button', { name: 'Remover captura.webp' })
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('o botão sumiu')
  })

  it('enquanto a pagina captura, o botao fica desligado', async () => {
    const host = pagina()
    const terminar = segurar(host)
    montar(host)

    const botao = screen.getByRole('button', { name: 'Capturar tela' }) as HTMLButtonElement
    fireEvent.click(botao)
    await waitFor(() => expect(botao.disabled).toBe(true))

    await act(async () => terminar({ outcome: 'cancel' }))
    expect(botao.disabled).toBe(false)
  })

  it('desistir nao e erro: o botao fica, e nada e dito', async () => {
    const host = pagina()
    host.capture.mockResolvedValue({ outcome: 'cancel' })
    montar(host)

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))

    await waitFor(() => expect(host.capture).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: /Remover/ })).toBeNull()
  })

  // A pagina nao deixou redesenhar. A proxima area pode dar certo, entao o botao fica.
  it('a pagina que nao deixa capturar diz para anexar uma imagem, e o botao fica', async () => {
    const host = pagina()
    host.capture.mockResolvedValue({ outcome: 'failed' })
    montar(host)

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Não deu para capturar esta página. Anexe uma imagem no lugar.',
    )
    expect(screen.getByRole('button', { name: 'Capturar tela' })).toBeDefined()
  })

  // A pagina proibe o nosso script ou a nossa camada: a recusa nao muda no proximo
  // clique, e o botao some.
  it('a pagina que proibe capturar tira o botao, e diz para anexar uma imagem', async () => {
    const host = pagina()
    host.capture.mockResolvedValue({ outcome: 'unavailable' })
    montar(host)

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Este site não deixa capturar a página. Anexe uma imagem no lugar.',
    )
    expect(screen.queryByRole('button', { name: 'Capturar tela' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toBeDefined()
  })

  // Quem usa teclado continua de onde estava: desligado durante a captura, o botao
  // tinha perdido o foco.
  it('o foco volta ao botao de capturar quando a captura termina', async () => {
    const host = pagina()
    const terminar = segurar(host)
    montar(host)

    const botao = screen.getByRole('button', { name: 'Capturar tela' })
    botao.focus()
    fireEvent.click(botao)
    await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(true))
    ;(document.activeElement as HTMLElement | null)?.blur()

    await act(async () => terminar({ outcome: 'cancel' }))

    expect(document.activeElement).toBe(botao)
  })

  // Marcar leva o tempo da pessoa. Fechado o quadro nesse meio, a captura nao entra no
  // formulario novo.
  it('captura que volta depois de fechar o quadro nao entra no formulario novo', async () => {
    const host = pagina()
    const terminar = segurar(host)
    montar(host)

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await act(async () => terminar({ outcome: 'file', file: captura() }))
    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))

    expect(screen.queryByRole('button', { name: 'Remover captura.webp' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Editor falso' })).toBeNull()
  })

  // O relato saiu com a lista que tinha: a captura que volta depois nao iria junto,
  // e entraria na confirmacao como "na fila" para sempre.
  it('captura que volta depois de o relato sair nao entra', async () => {
    dublê.criar.mockResolvedValue({
      TrackingCode: '7K2M-9QXP-4TRV',
      AccessToken: 'tok-secreto',
      CreatedAt: '2026-09-23T12:00:00.000Z',
      ReporterCode: null,
    })
    const host = pagina()
    const terminar = segurar(host)
    montar(host)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o botão sumiu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await screen.findByText('7K2M-9QXP-4TRV')

    await act(async () => terminar({ outcome: 'file', file: captura() }))

    expect(screen.queryByText('captura.webp')).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Editor falso' })).toBeNull()
  })
})
