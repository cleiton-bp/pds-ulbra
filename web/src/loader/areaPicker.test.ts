// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { type AreaPicker, MIN_AREA, normalizeArea, openAreaPicker } from '@/loader/areaPicker'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **Tres saidas, sempre**: arrastar marca a area; "Tela inteira" e o caminho de quem
 * usa teclado; "Cancelar" e Esc desistem. Uma camada sem saida prenderia a pessoa
 * em cima do site do cliente.
 *
 * **Arrastar para qualquer lado marca o mesmo retangulo**, e o clique curto nao
 * conta — capturar um ponto seria capturar nada.
 *
 * **A camada sai da pagina, e se marca para sair do print.** Ela esta por cima do
 * que a pessoa quer mostrar.
 */
let aberto: AreaPicker | null = null

afterEach(() => {
  aberto?.close()
  aberto = null
  document.body.innerHTML = ''
})

function abrir(): { picker: AreaPicker; sombra: ShadowRoot; camada: HTMLElement } {
  aberto = openAreaPicker()
  const host = document.querySelector('[data-pds-captura]') as HTMLElement
  const sombra = host.shadowRoot as ShadowRoot
  return { picker: aberto, sombra, camada: sombra.querySelector('.camada') as HTMLElement }
}

/** Um gesto do ponteiro, com as coordenadas da janela. */
function ponteiro(alvo: Element, tipo: string, x: number, y: number) {
  alvo.dispatchEvent(new MouseEvent(tipo, { clientX: x, clientY: y, bubbles: true }))
}

function botao(sombra: ShadowRoot, nome: string): HTMLButtonElement {
  const achado = Array.from(sombra.querySelectorAll('button')).find(
    (item) => item.textContent === nome,
  )
  if (!achado) throw new Error(`sem o botao ${nome}`)
  return achado
}

describe('a camada de marcar a area', () => {
  it('entra na pagina marcada para ficar fora do print, com as tres saidas', () => {
    const { sombra } = abrir()

    expect(document.querySelectorAll('[data-pds-captura]')).toHaveLength(1)
    expect(sombra.textContent).toContain('Arraste para marcar o que quer mostrar.')
    expect(botao(sombra, 'Tela inteira')).toBeDefined()
    expect(botao(sombra, 'Cancelar')).toBeDefined()
    // Enter captura a tela inteira: o foco comeca na saida do teclado.
    expect(sombra.activeElement).toBe(botao(sombra, 'Tela inteira'))
  })

  it('arrastar marca a area, em pixels da janela', async () => {
    const { picker, camada } = abrir()

    ponteiro(camada, 'pointerdown', 100, 80)
    ponteiro(camada, 'pointermove', 200, 150)
    ponteiro(camada, 'pointerup', 300, 240)

    await expect(picker.chosen).resolves.toEqual({ x: 100, y: 80, width: 200, height: 160 })
  })

  it('arrastar para cima e para a esquerda marca o mesmo retangulo', async () => {
    const { picker, camada } = abrir()

    ponteiro(camada, 'pointerdown', 300, 240)
    ponteiro(camada, 'pointerup', 100, 80)

    await expect(picker.chosen).resolves.toEqual({ x: 100, y: 80, width: 200, height: 160 })
  })

  it('o clique curto nao conta: a camada continua esperando', async () => {
    const { picker, camada } = abrir()

    ponteiro(camada, 'pointerdown', 100, 100)
    ponteiro(camada, 'pointerup', 100 + MIN_AREA - 1, 100 + MIN_AREA - 1)
    ponteiro(camada, 'pointerdown', 10, 10)
    ponteiro(camada, 'pointerup', 60, 70)

    await expect(picker.chosen).resolves.toEqual({ x: 10, y: 10, width: 50, height: 60 })
  })

  it('"Tela inteira" pede a area que se ve', async () => {
    const { picker, sombra } = abrir()

    botao(sombra, 'Tela inteira').click()

    await expect(picker.chosen).resolves.toBe('viewport')
  })

  it('"Cancelar" e Esc desistem', async () => {
    const primeiro = abrir()
    botao(primeiro.sombra, 'Cancelar').click()
    await expect(primeiro.picker.chosen).resolves.toBeNull()
    primeiro.picker.close()

    const segundo = abrir()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(segundo.picker.chosen).resolves.toBeNull()
  })

  // Os botoes ficam na camada; apertar um nao pode comecar uma area por baixo dele.
  it('apertar um botao nao comeca uma area', async () => {
    const { picker, sombra, camada } = abrir()
    const tela = botao(sombra, 'Tela inteira')

    ponteiro(tela, 'pointerdown', 5, 5)
    ponteiro(camada, 'pointerup', 400, 400)
    tela.click()

    await expect(picker.chosen).resolves.toBe('viewport')
  })

  it('ocupada, diz que gera a imagem e deixa so o Cancelar; fechada, sai da pagina', () => {
    const { picker, sombra } = abrir()

    picker.busy()
    expect(sombra.textContent).toContain('Gerando a imagem…')
    expect(botao(sombra, 'Tela inteira').hidden).toBe(true)
    expect(botao(sombra, 'Cancelar').hidden).toBe(false)
    expect(sombra.activeElement).toBe(botao(sombra, 'Cancelar'))

    picker.close()
    expect(document.querySelector('[data-pds-captura]')).toBeNull()
  })

  // Uma pagina pesada ou uma rede parada nao podem prender a pessoa debaixo do veu.
  it('ocupada, "Cancelar" e Esc interrompem a geracao', async () => {
    const primeiro = abrir()
    botao(primeiro.sombra, 'Tela inteira').click()
    primeiro.picker.busy()
    botao(primeiro.sombra, 'Cancelar').click()
    await expect(primeiro.picker.aborted).resolves.toBeUndefined()
    primeiro.picker.close()

    const segundo = abrir()
    botao(segundo.sombra, 'Tela inteira').click()
    segundo.picker.busy()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(segundo.picker.aborted).resolves.toBeUndefined()
  })

  // Arrastar ate fora da janela marca ate a borda — e nao um pedaco da pagina que a
  // pessoa nao via.
  it('arrastar para fora da janela para na borda', async () => {
    const { picker, camada } = abrir()

    ponteiro(camada, 'pointerdown', 200, 200)
    ponteiro(camada, 'pointerup', -60, -40)

    await expect(picker.chosen).resolves.toEqual({ x: 0, y: 0, width: 200, height: 200 })
  })

  it('arrastar alem da direita e de baixo para na largura e na altura da janela', async () => {
    const { picker, camada } = abrir()

    ponteiro(camada, 'pointerdown', window.innerWidth - 100, window.innerHeight - 50)
    ponteiro(camada, 'pointerup', window.innerWidth + 300, window.innerHeight + 300)

    await expect(picker.chosen).resolves.toEqual({
      x: window.innerWidth - 100,
      y: window.innerHeight - 50,
      width: 100,
      height: 50,
    })
  })

  // Um menu que fecha com clique fora fecharia antes do print — e era ele que a pessoa
  // queria mostrar.
  it('os cliques de marcar nao chegam aos ouvintes da pagina', () => {
    const ouvidos: string[] = []
    const ouvir = (evento: Event) => ouvidos.push(evento.type)
    const tipos = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']
    for (const tipo of tipos) document.addEventListener(tipo, ouvir)

    try {
      const { camada } = abrir()
      for (const tipo of tipos) {
        camada.dispatchEvent(
          new MouseEvent(tipo, { clientX: 10, clientY: 10, bubbles: true, composed: true }),
        )
      }
      expect(ouvidos).toEqual([])
    } finally {
      for (const tipo of tipos) document.removeEventListener(tipo, ouvir)
    }
  })

  // Sair da camada pelo Tab seria andar por links escondidos debaixo do veu.
  it('o Tab gira entre os botoes da camada, e nao sai dela', () => {
    const { sombra } = abrir()
    const tab = (shiftKey = false) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }),
      )

    expect(sombra.activeElement).toBe(botao(sombra, 'Tela inteira'))
    tab()
    expect(sombra.activeElement).toBe(botao(sombra, 'Cancelar'))
    tab()
    expect(sombra.activeElement).toBe(botao(sombra, 'Tela inteira'))
    tab(true)
    expect(sombra.activeElement).toBe(botao(sombra, 'Cancelar'))
  })

  it('o estilo entra na sombra, e nao na pagina', () => {
    const { sombra } = abrir()

    const naSombra = sombra.adoptedStyleSheets?.length > 0 || !!sombra.querySelector('style')
    expect(naSombra).toBe(true)
    expect(document.head.querySelector('style')).toBeNull()
  })

  it('fechar sem escolher e desistir: quem espera nao fica esperando', async () => {
    const { picker } = abrir()

    picker.close()

    await expect(picker.chosen).resolves.toBeNull()
  })

  it('segura a pagina parada enquanto a pessoa marca', () => {
    const { camada } = abrir()
    const rolar = new WheelEvent('wheel', { cancelable: true, bubbles: true })

    camada.dispatchEvent(rolar)

    expect(rolar.defaultPrevented).toBe(true)
  })
})

describe('o retangulo entre dois pontos', () => {
  it('e o mesmo em qualquer direcao', () => {
    const esperado = { x: 10, y: 20, width: 30, height: 40 }
    expect(normalizeArea({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(esperado)
    expect(normalizeArea({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(esperado)
    expect(normalizeArea({ x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(esperado)
  })
})
