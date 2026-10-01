// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import { EmbedApp } from '@/embed/EmbedApp'
import type { CaptureOutcome } from '@/embed/hostBridge'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTE TESTE TRAVA.
 *
 * **"Tentar de novo" tenta de novo de verdade.** A primeira busca do editor falha, a
 * segunda chega — e a captura segue para ele, e dele para a lista.
 */
const tentativas = vi.hoisted(() => ({ n: 0 }))

vi.mock('@/editor/ImageEditor', async () => {
  tentativas.n += 1
  if (tentativas.n === 1) throw new Error('a rede caiu')
  return import('@/test/fakeImageEditor')
})

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

afterEach(cleanup)

describe('tentar de novo', () => {
  it('a segunda busca abre o editor, e a captura segue dele para a lista', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    await screen.findByText('O editor não abriu. Confira a conexão e tente de novo.')

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Concluir sem marcas' }))
    await screen.findByRole('button', { name: 'Remover captura.webp' })
    expect(tentativas.n).toBe(2)
  })
})
