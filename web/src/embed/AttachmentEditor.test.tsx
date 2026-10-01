// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import { EmbedApp } from '@/embed/EmbedApp'
import type { CaptureOutcome } from '@/embed/hostBridge'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O editor que nao chega nao decide pela pessoa.** Ele baixa so quando alguem o
 * abre, e a rede pode cair nesse meio. **A captura nao entra sozinha**: quem contava
 * em cobrir a senha no editor escolhe — tentar de novo, adicionar sem marcas ou
 * descartar. A imagem que ja estava na lista so continua la.
 *
 * **O lugar do editor prende o foco e tem saida**, como o editor: sem isso, o Tab
 * andaria pelo formulario escondido atras, e o quadro ficaria do tamanho do editor
 * sem botao nenhum.
 */
vi.mock('@/editor/ImageEditor', () => {
  throw new Error('a rede caiu')
})

const config = {
  key: 'pk_DEMO',
  route: '/checkout',
  origin: 'loja.exemplo.com',
  viewport: '1280x800',
}

const media: PublicMediaSettingsViewModel = {
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
}

const NAO_ABRIU = 'O editor não abriu. Confira a conexão e tente de novo.'

function montar() {
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
  render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={host} media={media} />)
  fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
  host.expand.mockClear()
  return host
}

async function capturar(host: ReturnType<typeof montar>) {
  host.capture.mockResolvedValue({
    outcome: 'file',
    file: new File([new Uint8Array(100)], 'captura.webp', { type: 'image/webp' }),
  })
  fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
  await screen.findByText(NAO_ABRIU)
}

const botao = (nome: string) => screen.getByRole('button', { name: nome })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('o editor que nao carrega', () => {
  it('a captura nao entra sozinha: tentar de novo, adicionar sem marcas ou descartar', async () => {
    const host = montar()
    await capturar(host)

    expect(screen.queryByRole('button', { name: 'Remover captura.webp' })).toBeNull()
    expect(botao('Tentar de novo')).toBeDefined()
    expect(botao('Descartar')).toBeDefined()

    fireEvent.click(botao('Adicionar sem marcas'))

    await screen.findByRole('button', { name: 'Remover captura.webp' })
    await waitFor(() => expect(host.expand).toHaveBeenCalled())
  })

  it('descartar: nada entra, e o quadro volta ao tamanho do formulario', async () => {
    const host = montar()
    await capturar(host)

    fireEvent.click(botao('Descartar'))

    expect(screen.queryByText(NAO_ABRIU)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Remover/ })).toBeNull()
    await waitFor(() => expect(host.expand).toHaveBeenCalled())
  })

  // Que a segunda tentativa abre o editor e o que `AttachmentEditor.retry.test` trava;
  // aqui, que falhar de novo continua sem por nada na lista.
  it('falhando de novo, continua oferecendo as saidas, e nada entra', async () => {
    const host = montar()
    await capturar(host)

    fireEvent.click(botao('Tentar de novo'))

    await screen.findByText(NAO_ABRIU)
    expect(botao('Adicionar sem marcas')).toBeDefined()
    expect(screen.queryByRole('button', { name: /^Remover/ })).toBeNull()
  })

  it('a imagem da lista continua la, e sem "adicionar sem marcas"', async () => {
    montar()
    fireEvent.change(screen.getByLabelText('Escolher imagem para anexar'), {
      target: { files: [new File([new Uint8Array(100)], 'erro.png', { type: 'image/png' })] },
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Editar erro.png' }))
    await screen.findByText(NAO_ABRIU)
    expect(screen.queryByRole('button', { name: 'Adicionar sem marcas' })).toBeNull()

    fireEvent.click(botao('Cancelar'))

    expect(screen.getByRole('button', { name: 'Remover erro.png' })).toBeDefined()
  })
})

describe('o lugar do editor, enquanto ele chega', () => {
  it('prende o foco nas saidas dele, e o Esc desiste', async () => {
    const host = montar()
    await capturar(host)
    const lugar = screen.getByRole('dialog')

    await waitFor(() => expect(document.activeElement).toBe(botao('Tentar de novo')))
    fireEvent.keyDown(lugar, { key: 'Tab' })
    expect(document.activeElement).toBe(botao('Adicionar sem marcas'))
    fireEvent.keyDown(lugar, { key: 'Tab' })
    fireEvent.keyDown(lugar, { key: 'Tab' })
    expect(document.activeElement).toBe(botao('Tentar de novo'))
    fireEvent.keyDown(lugar, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(botao('Descartar'))

    fireEvent.keyDown(lugar, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Remover/ })).toBeNull()
  })

  it('diz o que esta acontecendo a quem nao ve a tela', async () => {
    const host = montar()
    await capturar(host)

    expect(screen.getByRole('status').textContent).toBe(NAO_ABRIU)
    expect(screen.getByRole('dialog', { name: NAO_ABRIU })).toBeDefined()
  })
})
