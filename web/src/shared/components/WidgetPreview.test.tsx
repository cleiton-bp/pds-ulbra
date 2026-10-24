// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { WidgetPreview } from '@/shared/components/WidgetPreview'
import { actAsPreviewFrame, lastPreview } from '@/test/previewFrame'

/**
 * O QUE ESTES TESTES TRAVAM: quem desenha cada realce. **O do botao e do painel** (as
 * guias e o contorno do botao), e nao vai ao quadro; **o do formulario vai ao quadro**,
 * na mensagem da previa, que se contorna sozinho.
 */
vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  // A previa so desenha o quadro com a ferramenta na mesma origem do painel.
  return {
    ...real,
    environment: { ...real.environment, embedUrl: `${window.location.origin}/embed.html` },
  }
})

afterEach(cleanup)

describe('WidgetPreview', () => {
  it('a parte do formulário vai ao quadro; o realce do botão fica no painel', async () => {
    const { rerender } = render(
      <WidgetPreview settings={DEFAULT_WIDGET_SETTINGS} highlight="button" startOpen />,
    )
    const lidas = actAsPreviewFrame()
    await waitFor(() => expect(lastPreview(lidas)).toBeDefined())
    expect(lastPreview(lidas)?.highlight).toBeNull()

    rerender(<WidgetPreview settings={DEFAULT_WIDGET_SETTINGS} highlight="form-box" startOpen />)
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBe('form-box'))

    rerender(<WidgetPreview settings={DEFAULT_WIDGET_SETTINGS} highlight={null} startOpen />)
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBeNull())
  })
})
