// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { FRAME_SIZE, MESSAGE_SOURCE } from '@/embed/protocol'

/**
 * O QUE ESTES TESTES TRAVAM — o cliente que dispensa o nosso botao (`data-button="none"`).
 *
 * **Nenhuma requisicao ate alguem pedir**, nem a da aparencia. **`Pds.open()` chamado
 * antes de o documento ficar pronto espera na fila**, e abre quando ele fica. Qualquer
 * elemento com `data-pds-open` abre, e fechar devolve o foco a ele.
 *
 * O carregador roda uma vez por pagina e guarda estado no modulo, entao os casos
 * abaixo sao uma sequencia: cada um parte de onde o anterior parou.
 */
const ORIGEM = 'https://cdn.pds.test'

const fetchMock = vi.fn()

/** O documento comeca carregando: o carregador com `defer` pode rodar antes do fim. */
let estadoDoDocumento: DocumentReadyState = 'loading'

const pds = () => (window as unknown as { Pds: { open(): void; close(): void } }).Pds

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => estadoDoDocumento,
  })

  const script = document.createElement('script')
  script.src = `${ORIGEM}/v1/pds.js`
  script.dataset.key = 'pk_teste'
  script.dataset.button = 'none'
  Object.defineProperty(document, 'currentScript', { configurable: true, get: () => script })

  await import('@/loader/main')
})

function quadro(): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>('iframe[data-pds]')
}

function host(): HTMLElement | null {
  return document.querySelector<HTMLElement>('pds-launcher')
}

function doQuadro(data: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin: ORIGEM,
      source: quadro()?.contentWindow ?? null,
    }),
  )
}

describe('o cliente que abre pelo proprio botao', () => {
  it('nao faz requisicao nenhuma nem poe nada na pagina ao carregar', () => {
    expect(fetchMock).not.toHaveBeenCalled()
    expect(host()).toBeNull()
    expect(quadro()).toBeNull()
    expect(typeof pds().open).toBe('function')
  })

  it('`Pds.open()` antes de o documento ficar pronto espera na fila', () => {
    pds().open()
    expect(quadro()).toBeNull()
    expect(host()).toBeNull()

    estadoDoDocumento = 'interactive'
    document.dispatchEvent(new Event('DOMContentLoaded'))

    expect(quadro()).not.toBeNull()
    expect(quadro()?.style.visibility).toBe('hidden')
    // A tela de "abrindo", no canto, ate o quadro responder.
    expect(host()?.style.getPropertyValue('display')).toBe('block')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Esc desiste da tela de abrindo, e o quadro fica guardado', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(host()?.style.getPropertyValue('display')).toBe('none')
    expect(quadro()).not.toBeNull()
  })

  it('elemento com `data-pds-open` abre, mesmo clicado por dentro', () => {
    const gatilho = document.createElement('button')
    gatilho.id = 'ajuda'
    gatilho.setAttribute('data-pds-open', '')
    const rotulo = document.createElement('span')
    rotulo.textContent = 'Ajuda'
    gatilho.appendChild(rotulo)
    document.body.appendChild(gatilho)

    gatilho.focus()
    rotulo.click()

    expect(host()?.style.getPropertyValue('display')).toBe('block')

    doQuadro({ source: MESSAGE_SOURCE, type: 'resize', ...FRAME_SIZE.expanded })
    expect(quadro()?.style.visibility).toBe('visible')
    expect(host()?.style.getPropertyValue('display')).toBe('none')
  })

  it('fechar devolve o foco ao elemento de onde se abriu', () => {
    const gatilho = document.getElementById('ajuda') as HTMLButtonElement
    // O foco esta dentro do quadro enquanto ele esta aberto.
    gatilho.blur()
    expect(document.activeElement).not.toBe(gatilho)

    doQuadro({ source: MESSAGE_SOURCE, type: 'close' })

    expect(quadro()?.style.visibility).toBe('hidden')
    expect(document.activeElement).toBe(gatilho)
    // Sem o nosso botao, nada volta para o canto.
    expect(host()?.style.getPropertyValue('display')).toBe('none')
  })

  it('clique fora de `data-pds-open` nao abre', () => {
    const outro = document.createElement('button')
    document.body.appendChild(outro)
    outro.click()

    expect(quadro()?.style.visibility).toBe('hidden')
    expect(host()?.style.getPropertyValue('display')).toBe('none')
  })

  it('nenhuma requisicao saiu em todo o caminho', () => {
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
