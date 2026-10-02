// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import { EDITOR_LOAD_TIMEOUT_MS } from '@/embed/AttachmentEditor'
import { EmbedApp } from '@/embed/EmbedApp'
import type { CaptureOutcome } from '@/embed/hostBridge'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTE TESTE TRAVA.
 *
 * **Uma rede parada nao avisa quando desistir.** O editor que nunca chega — nem falha —
 * deixaria a pessoa diante de "Abrindo o editor…" para sempre, no quadro ja ampliado.
 * Passado o prazo, as saidas aparecem, e a captura continua fora da lista.
 */
vi.mock('@/editor/ImageEditor', () => new Promise(() => {}))

const media: PublicMediaSettingsViewModel = {
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
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function pagina() {
  const host = {
    init: null,
    show: vi.fn(),
    expand: vi.fn(),
    collapse: vi.fn(),
    enlarge: vi.fn(),
    canCapture: true,
    capture: vi.fn<(maxBytes: number | null) => Promise<CaptureOutcome>>(),
    stop: vi.fn(),
  }
  host.capture.mockResolvedValue({
    outcome: 'file',
    file: new File([new Uint8Array(100)], 'captura.webp', { type: 'image/webp' }),
  })
  render(
    <EmbedApp
      settings={DEFAULT_WIDGET_SETTINGS}
      config={{ key: 'pk_DEMO', route: '/', origin: 'loja.exemplo.com', viewport: '1280x800' }}
      host={host}
      media={media}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
  return host
}

// Com o editor ainda chegando, o quadro devolvia o foco ao "Capturar tela", atras do
// veu: o Esc nao fechava nada, e um Enter pedia outra captura — que tomava o lugar da
// primeira sem aviso.
describe('enquanto o editor chega, depois de uma captura', () => {
  it('o foco fica no lugar do editor, e nao volta ao botao de capturar', async () => {
    const host = pagina()
    const capturar = screen.getByRole('button', { name: 'Capturar tela' })
    capturar.focus()

    fireEvent.click(capturar)
    const lugar = await screen.findByRole('dialog')
    await act(async () => {})

    expect(lugar.contains(document.activeElement)).toBe(true)
    // "Descartar" nao comeca com o foco: um Enter ali jogaria a captura fora.
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Descartar' }))
    expect(host.capture).toHaveBeenCalledTimes(1)
  })

  // A trava do veu puxaria o foco de volta de todo jeito; o quadro nem deve tenta-lo, ou
  // o leitor de tela anuncia o botao de passagem.
  it('o quadro nem tenta devolver o foco ao botao de capturar', async () => {
    pagina()
    const capturar = screen.getByRole('button', { name: 'Capturar tela' })
    const foco = vi.spyOn(capturar, 'focus')

    fireEvent.click(capturar)
    await screen.findByRole('dialog')
    await act(async () => {})

    expect(foco).not.toHaveBeenCalled()
  })

  it('o foco que tenta sair volta para ele', async () => {
    pagina()
    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    const lugar = await screen.findByRole('dialog')

    screen.getByRole('button', { name: 'Anexar imagem' }).focus()

    expect(document.activeElement).toBe(lugar)
  })

  it('capturar de novo, com uma captura no editor, nao pede outra', async () => {
    const host = pagina()
    const capturar = screen.getByRole('button', { name: 'Capturar tela' })
    fireEvent.click(capturar)
    await screen.findByRole('dialog')

    fireEvent.click(capturar)
    await act(async () => {})

    expect(host.capture).toHaveBeenCalledTimes(1)
  })
})

describe('o editor que nao chega', () => {
  // Relogio falso sem avancar sozinho, e sem `findBy`: esperar pelo `findBy` com o
  // relogio falso deixa a biblioteca de testes adianta-lo, e o prazo venceria antes de
  // o teste olhar. Aqui o tempo so anda quando o teste manda.
  it('enquanto chega, so "Descartar"; passado o prazo, as saidas', async () => {
    vi.useFakeTimers()
    pagina()

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    await act(async () => {})
    await act(async () => {})

    expect(screen.getByText('Abrindo o editor…')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Adicionar sem marcas' })).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(EDITOR_LOAD_TIMEOUT_MS - 1)
    })
    expect(screen.getByText('Abrindo o editor…')).toBeDefined()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.getByText('O editor não abriu. Confira a conexão e tente de novo.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Adicionar sem marcas' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Remover captura.webp' })).toBeNull()
  })
})
