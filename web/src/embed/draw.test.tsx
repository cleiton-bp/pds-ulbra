// @vitest-environment jsdom

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicMediaSettingsViewModel, WidgetSettingsViewModel } from '@/contracts'
import { draw, MEDIA_GRACE_MS } from '@/embed/draw'
import { EmbedApp } from '@/embed/EmbedApp'
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
  media: vi.fn<() => Promise<PublicMediaSettingsViewModel | null>>(async () => null),
}))

vi.mock('@/embed/resolveSettings', () => ({ resolveWidgetSettings: dublê.widget }))
vi.mock('@/embed/resolveMediaSettings', () => ({ resolveMediaSettings: dublê.media }))
// O quadro de verdade, espiado: e por ele que se ve o que chegou de midia.
vi.mock('@/embed/EmbedApp', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/embed/EmbedApp')>()
  return { ...real, EmbedApp: vi.fn(real.EmbedApp) }
})

const MIDIA: PublicMediaSettingsViewModel = {
  IsEnabled: true,
  AllowsScreenCapture: true,
  AllowsOnInfoRequest: false,
  AllowsOnReopen: false,
  Kinds: [{ Kind: 'Image', MaxCount: 3, MaxBytes: 5 * 1024 * 1024, ContentTypes: ['image/png'] }],
}

/** A midia que o quadro recebeu no ultimo desenho. */
const midiaDesenhada = () => vi.mocked(EmbedApp).mock.lastCall?.[0].media

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
    canCapture: false,
    capture: vi.fn(),
    stop: vi.fn(),
  }
}

beforeEach(() => {
  // A leitura de midia volta ao padrao a cada teste: a que nunca responde nao pode
  // vazar para o seguinte.
  dublê.media.mockReset()
  dublê.media.mockResolvedValue(null)
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

describe('a leitura de midia tem prazo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('presa, ela nao prende o quadro: passado o prazo, ele aparece sem anexo', async () => {
    vi.useFakeTimers()
    dublê.widget.mockResolvedValue(DEFAULT_WIDGET_SETTINGS)
    dublê.media.mockReturnValue(new Promise(() => {}))
    const host = pagina()

    const desenhando = draw(root, config, host)
    await vi.advanceTimersByTimeAsync(MEDIA_GRACE_MS - 1)
    expect(host.show).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await desenhando

    expect(host.show).toHaveBeenCalledOnce()
    expect(midiaDesenhada()).toBeNull()
  })

  it('a que chega dentro do prazo entra, sem esperar o prazo inteiro', async () => {
    vi.useFakeTimers()
    dublê.widget.mockResolvedValue(DEFAULT_WIDGET_SETTINGS)
    dublê.media.mockReturnValue(
      new Promise((resolve) => setTimeout(() => resolve(MIDIA), MEDIA_GRACE_MS - 500)),
    )
    const host = pagina()

    const desenhando = draw(root, config, host)
    await vi.advanceTimersByTimeAsync(MEDIA_GRACE_MS - 500)
    await desenhando

    expect(host.show).toHaveBeenCalledOnce()
    expect(midiaDesenhada()).toEqual(MIDIA)
  })

  it('a leitura que chega a tempo desarma o prazo: nenhum relogio fica pendurado', async () => {
    vi.useFakeTimers()
    dublê.widget.mockResolvedValue(DEFAULT_WIDGET_SETTINGS)
    dublê.media.mockResolvedValue(MIDIA)
    const antes = vi.getTimerCount()

    await draw(root, config, pagina())

    // O quadro desenhado nao arma relogio nenhum; o unico que poderia sobrar e o do prazo.
    expect(vi.getTimerCount()).toBe(antes)
  })

  it('as duas saem juntas: o prazo conta depois da configuracao, e nao da abertura', async () => {
    vi.useFakeTimers()
    // A API lenta para tudo — as duas respostas chegam juntas, depois do prazo.
    const lenta = <T,>(valor: T) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(valor), MEDIA_GRACE_MS * 3))
    dublê.widget.mockReturnValue(lenta(DEFAULT_WIDGET_SETTINGS))
    dublê.media.mockReturnValue(lenta(MIDIA))
    const host = pagina()

    const desenhando = draw(root, config, host)
    await vi.advanceTimersByTimeAsync(MEDIA_GRACE_MS * 3)
    await desenhando

    expect(dublê.media).toHaveBeenCalledOnce()
    expect(midiaDesenhada()).toEqual(MIDIA)
  })

  it('chave recusada nao espera a midia', async () => {
    dublê.widget.mockResolvedValue(null)
    dublê.media.mockReturnValue(new Promise(() => {}))
    const host = pagina()

    await draw(root, config, host)

    expect(host.show).not.toHaveBeenCalled()
  })
})
