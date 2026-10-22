// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { WidgetLauncherViewModel } from '@/embed/launcher'
import { FRAME_SIZE, MESSAGE_SOURCE } from '@/embed/protocol'

/**
 * O QUE ESTES TESTES TRAVAM — o carregador com o nosso botao.
 *
 * **Nada pesado ate alguem pedir**: o quadro so nasce na intencao (passar o mouse) ou
 * no clique; abrir mostra a tela de "abrindo" ate o quadro responder; fechar devolve o
 * foco ao botao. **A pagina escondida tira o botao** a cada navegacao.
 *
 * O carregador roda uma vez por pagina e guarda estado no modulo (e `window.Pds` nao
 * se apaga), entao os casos abaixo sao uma sequencia: cada um parte de onde o
 * anterior parou. O cliente que dispensa o nosso botao fica em `main.ownButton.test.ts`.
 */
const ORIGEM = 'https://cdn.pds.test'

const aparencia: WidgetLauncherViewModel = {
  IsEnabled: true,
  AccentColor: '#2563eb',
  Position: 'BottomRight',
  Theme: 'Light',
  FormBackgroundColor: null,
  OffsetX: 20,
  OffsetY: 20,
  LauncherIcon: 'Chat',
  LauncherIconOnly: false,
  LauncherSize: 'Medium',
  LauncherShape: 'Pill',
  LauncherTextColor: null,
  LauncherShadow: false,
  MobileMode: 'Same',
  HiddenPaths: ['/checkout*'],
  LauncherLabel: 'Relatar',
}

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
  ok: true,
  json: async () => ({ Data: aparencia }),
}))

/** As sombras fechadas criadas na pagina: o teste precisa entrar no botao. */
const raizes: ShadowRoot[] = []

beforeAll(async () => {
  const anexar = Element.prototype.attachShadow
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
    this: Element,
    init: ShadowRootInit,
  ) {
    const raiz = anexar.call(this, init)
    raizes.push(raiz)
    return raiz
  })
  vi.stubGlobal('fetch', fetchMock)

  const script = document.createElement('script')
  script.src = `${ORIGEM}/v1/pds.js`
  script.dataset.key = 'pk_teste'
  Object.defineProperty(document, 'currentScript', { configurable: true, get: () => script })

  await import('@/loader/main')
})

function host(): HTMLElement {
  const elemento = document.querySelector<HTMLElement>('pds-launcher')
  if (!elemento) throw new Error('sem o elemento do botao')
  return elemento
}

function sombra(): ShadowRoot {
  const raiz = raizes[0]
  if (!raiz) throw new Error('sem a sombra do botao')
  return raiz
}

function botao(): HTMLButtonElement {
  const elemento = sombra().querySelector<HTMLButtonElement>('button.botao')
  if (!elemento) throw new Error('sem o botao')
  return elemento
}

function painel(): HTMLElement {
  const elemento = sombra().querySelector<HTMLElement>('.painel')
  if (!elemento) throw new Error('sem a tela de abrindo')
  return elemento
}

function quadros(): HTMLIFrameElement[] {
  return Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[data-pds]'))
}

function doQuadro(data: unknown, origem = ORIGEM): void {
  const quadro = quadros()[0]
  window.dispatchEvent(
    new MessageEvent('message', { data, origin: origem, source: quadro?.contentWindow ?? null }),
  )
}

const visivel = (elemento: HTMLElement) => elemento.style.getPropertyValue('display') !== 'none'

describe('o carregador com o nosso botao', () => {
  it('le a aparencia uma vez, pela rota leve e sem credencial', async () => {
    await vi.waitFor(() => expect(document.querySelector('pds-launcher')).not.toBeNull())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toContain('/public/widget-launcher?')
    expect(new URL(String(url)).searchParams.get('key')).toBe('pk_teste')
    expect(init).toMatchObject({ credentials: 'omit' })
  })

  it('desenha o botao e nao cria o quadro antes de alguem pedir', () => {
    expect(visivel(host())).toBe(true)
    expect(botao().getAttribute('aria-label')).toBe('Relatar')
    expect(botao().textContent).toContain('Relatar')
    expect(quadros()).toHaveLength(0)
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('passar o mouse adianta o quadro, escondido, e uma vez so', () => {
    botao().dispatchEvent(new Event('pointerenter'))

    expect(quadros()).toHaveLength(1)
    const quadro = quadros()[0] as HTMLIFrameElement
    expect(quadro.src).toBe(`${ORIGEM}/embed.html`)
    expect(quadro.style.visibility).toBe('hidden')
    // O botao continua no lugar: adiantar nao e abrir.
    expect(visivel(host())).toBe(true)
    expect(painel().hidden).toBe(true)

    botao().dispatchEvent(new Event('pointerenter'))
    expect(quadros()).toHaveLength(1)
  })

  it('o clique mostra a tela de abrindo ate o quadro responder', () => {
    botao().focus()
    botao().click()

    expect(painel().hidden).toBe(false)
    expect(painel().getAttribute('aria-busy')).toBe('true')
    expect(painel().textContent).toContain('Abrindo o formulário')
    expect((quadros()[0] as HTMLIFrameElement).style.visibility).toBe('hidden')
  })

  it('mensagem de outra origem ou com tamanho invalido nao revela o quadro', () => {
    const resize = { source: MESSAGE_SOURCE, type: 'resize', ...FRAME_SIZE.expanded }
    doQuadro(resize, 'https://intruso.test')
    doQuadro({ ...resize, width: 'grande' })

    expect((quadros()[0] as HTMLIFrameElement).style.visibility).toBe('hidden')
    expect(painel().hidden).toBe(false)
  })

  it('o primeiro tamanho do quadro tira a tela de abrindo e mostra o quadro', () => {
    doQuadro({ source: MESSAGE_SOURCE, type: 'resize', ...FRAME_SIZE.expanded })

    const quadro = quadros()[0] as HTMLIFrameElement
    expect(quadro.style.visibility).toBe('visible')
    expect(quadro.style.width).toBe(`${FRAME_SIZE.expanded.width}px`)
    expect(visivel(host())).toBe(false)
    // O foco saiu do botao (foi para o "Fechar" da tela de abrindo, depois para o quadro).
    expect(sombra().activeElement).not.toBe(botao())
  })

  it('fechar esconde o quadro, guarda-o, volta o botao e devolve o foco a ele', () => {
    doQuadro({ source: MESSAGE_SOURCE, type: 'close' })

    expect(quadros()).toHaveLength(1)
    expect((quadros()[0] as HTMLIFrameElement).style.visibility).toBe('hidden')
    expect(visivel(host())).toBe(true)
    expect(sombra().activeElement).toBe(botao())
  })

  it('`Pds.open()` reabre na hora o quadro ja carregado, e `Pds` nao se troca', () => {
    const pds = (window as unknown as { Pds: { open(): void; close(): void } }).Pds
    expect(Object.isFrozen(pds)).toBe(true)

    pds.open()
    expect((quadros()[0] as HTMLIFrameElement).style.visibility).toBe('visible')
    expect(painel().hidden).toBe(true)

    pds.close()
    expect((quadros()[0] as HTMLIFrameElement).style.visibility).toBe('hidden')
    expect(visivel(host())).toBe(true)
  })

  it('a pagina escondida tira o botao, e ele volta fora dela', () => {
    window.history.pushState(null, '', '/checkout/pagar')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(visivel(host())).toBe(false)

    window.history.pushState(null, '', '/produtos')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(visivel(host())).toBe(true)
  })

  it('a pagina escondida e conferida de novo quando o botao volta depois de fechar', () => {
    // Navegacao sem aviso nenhum, com o quadro aberto: o botao nao pode voltar nela.
    const pds = (window as unknown as { Pds: { open(): void; close(): void } }).Pds
    pds.open()
    window.history.pushState(null, '', '/checkout')
    pds.close()

    expect(visivel(host())).toBe(false)
    window.history.pushState(null, '', '/')
  })
})
