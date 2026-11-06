// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmbedApp } from '@/embed/EmbedApp'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { createLauncherView } from '@/loader/launcherView'

/**
 * O QUE ESTES TESTES TRAVAM: na previa do painel, o tema `Auto` segue o tema do painel, e
 * nao o sistema de quem olha.
 *
 * O botao da previa e desenhado no proprio painel, e o formulario num `iframe`. Cada um
 * resolvia o `Auto` por um caminho: com o painel claro e o sistema escuro, o botao de
 * fabrica (cor padrao, tema automatico) saia cinza claro na pagina clara, e a previa do
 * projeto novo parecia nao ter carregado. Agora os dois seguem o painel, e so na previa:
 * no site do cliente, `Auto` continua sendo o sistema de quem visita.
 */

/** O sistema de quem olha, no escuro: e o caso que fazia o botao destoar. */
function sistemaEscuro(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((consulta: string) => ({
      matches: consulta.includes('dark'),
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

beforeEach(sistemaEscuro)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-theme')
})

function botaoDaPrevia(tema: 'Auto' | 'Light' | 'Dark', autoTheme?: () => 'light' | 'dark') {
  const pagina = document.createElement('div')
  document.body.append(pagina)
  const vista = createLauncherView({
    parent: pagina,
    placement: 'absolute',
    viewport: () => ({ width: 1280, height: 600 }),
    autoTheme,
    onOpen: () => {},
  })
  vista.setAppearance({ ...DEFAULT_WIDGET_SETTINGS, Theme: tema })
  vista.show('button')
  return pagina.querySelector('[data-pds-launcher]')?.getAttribute('data-tema')
}

describe('o botao da previa', () => {
  it('no Auto, segue o tema que o painel passa, e nao o sistema', () => {
    expect(botaoDaPrevia('Auto', () => 'light')).toBe('claro')
    expect(botaoDaPrevia('Auto', () => 'dark')).toBe('escuro')
  })

  it('sem o tema do painel (o site do cliente), o Auto segue o sistema', () => {
    expect(botaoDaPrevia('Auto')).toBe('escuro')
  })

  it('o tema escolhido pelo cliente vale sempre', () => {
    expect(botaoDaPrevia('Light', () => 'dark')).toBe('claro')
    expect(botaoDaPrevia('Dark', () => 'light')).toBe('escuro')
  })
})

describe('o formulario da previa', () => {
  const config = { key: '', route: null, origin: null, viewport: null, viewportWidth: null }

  it('no Auto, usa o tema mandado pelo painel', () => {
    render(
      <EmbedApp
        settings={{ ...DEFAULT_WIDGET_SETTINGS, Theme: 'Auto' }}
        config={config}
        preview
        previewTheme="light"
      />,
    )
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('fora da previa, o tema mandado nao vale: o Auto segue o sistema', () => {
    render(
      <EmbedApp
        settings={{ ...DEFAULT_WIDGET_SETTINGS, Theme: 'Auto' }}
        config={config}
        previewTheme="light"
      />,
    )
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('o tema escolhido pelo cliente vence o do painel', () => {
    render(
      <EmbedApp
        settings={{ ...DEFAULT_WIDGET_SETTINGS, Theme: 'Dark' }}
        config={config}
        preview
        previewTheme="light"
      />,
    )
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
