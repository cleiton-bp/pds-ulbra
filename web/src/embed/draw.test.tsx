// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WidgetSettingsViewModel } from '@/contracts'
import { draw } from '@/embed/draw'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * O quadro nasce invisivel e so aparece quando pede. Ele pedia depois de um
 * `requestAnimationFrame` — e o Chrome **nao roda** `requestAnimationFrame` num
 * quadro invisivel de outro site. No site do cliente, que e sempre outro site, a
 * ferramenta nunca aparecia; em `localhost`, que e o mesmo site do painel,
 * aparecia. Nenhum teste via isso, porque o jsdom roda o `requestAnimationFrame`.
 *
 * Aqui ele e trocado por um que **nunca responde**, como o Chrome faz. Se alguem
 * voltar a esperar um quadro pintado antes de pedir para aparecer, o primeiro
 * teste quebra.
 */

const dublê = vi.hoisted(() => ({
  widget: vi.fn<() => Promise<WidgetSettingsViewModel | null>>(),
  media: vi.fn(async () => null),
}))

vi.mock('@/embed/resolveSettings', () => ({ resolveWidgetSettings: dublê.widget }))
vi.mock('@/embed/resolveMediaSettings', () => ({ resolveMediaSettings: dublê.media }))

const config = {
  key: 'pk_DEMO',
  route: '/checkout',
  origin: 'loja.exemplo.com',
  viewport: '1280x800',
}

let container: HTMLDivElement
let root: Root

function pagina() {
  return {
    init: null,
    show: vi.fn(),
    expand: vi.fn(),
    collapse: vi.fn(),
    enlarge: vi.fn(),
    stop: vi.fn(),
  }
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  // Como o Chrome num quadro invisivel de outro site: o pedido fica sem resposta.
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 0),
  )
})

afterEach(() => {
  root.unmount()
  container.remove()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('desenhar e revelar o quadro', () => {
  it('pede para aparecer sem esperar o navegador pintar', async () => {
    dublê.widget.mockResolvedValue({ ...DEFAULT_WIDGET_SETTINGS, Position: 'BottomLeft' })
    const host = pagina()

    await draw(root, config, host)

    expect(host.show).toHaveBeenCalledExactlyOnceWith('BottomLeft')
  })

  it('o quadro ja esta desenhado quando pede para aparecer — nada de caixa vazia', async () => {
    dublê.widget.mockResolvedValue({
      ...DEFAULT_WIDGET_SETTINGS,
      LauncherLabel: 'Fale com a gente',
    })
    const host = pagina()
    let desenhadoNaHora = ''
    host.show.mockImplementation(() => {
      desenhadoNaHora = container.textContent ?? ''
    })

    await draw(root, config, host)

    expect(desenhadoNaHora).toContain('Fale com a gente')
  })

  it('chave recusada ou pagina fora da lista: nunca aparece', async () => {
    dublê.widget.mockResolvedValue(null)
    const host = pagina()

    await draw(root, config, host)

    expect(host.show).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
  })

  it('desligada dentro de uma pagina: some, sem mensagem', async () => {
    dublê.widget.mockResolvedValue({ ...DEFAULT_WIDGET_SETTINGS, IsEnabled: false })
    const host = pagina()

    await draw(root, config, host)

    expect(host.show).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
  })

  it('desligada e aberta direto: explica, em vez de um retangulo branco', async () => {
    dublê.widget.mockResolvedValue({ ...DEFAULT_WIDGET_SETTINGS, IsEnabled: false })

    await draw(root, config, null)
    await vi.waitFor(() => expect(container.textContent).toContain('desligada'))
  })
})
