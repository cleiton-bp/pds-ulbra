// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { PreviewSection } from '@/shared/components/PreviewSection'

/**
 * O QUE ESTES TESTES TRAVAM: **a previa cabe na tela**. No computador, a coluna da previa
 * tem a altura que sobra da janela, e a previa do formulario a preenche (o palco cresce
 * com ela). Com o palco de altura fixa, numa tela mais baixa o pe do formulario (a area de
 * anexar, o Enviar) ficava abaixo da dobra, e a pessoa tinha de rolar a pagina para ver.
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

describe('EditorWithPreview', () => {
  it('no computador, a coluna da prévia tem a altura que sobra da tela, e a prévia do formulário a preenche', () => {
    const { container } = render(
      <EditorWithPreview
        preview={
          <PreviewSection
            settings={DEFAULT_WIDGET_SETTINGS}
            dirty={false}
            hint="O formulário como está aqui."
            startOpen
          />
        }
      >
        <p>os controles</p>
      </EditorWithPreview>,
    )

    const coluna = container.querySelector<HTMLElement>('[data-guia="previa"]')
    // A janela do jsdom (768 de altura), menos onde a coluna esta (0) e o respiro de baixo.
    expect(coluna?.style.height).toBe(`${window.innerHeight - 16}px`)
    // A secao e o palco crescem com a coluna, em vez dos 480 fixos.
    expect(coluna?.querySelector('section')?.className).toContain('flex-1')
    const palco = coluna?.querySelector('[role="tabpanel"]')
    expect(palco?.className).toContain('flex-1')
    expect(palco?.className).not.toContain('h-[30rem]')
  })
})
