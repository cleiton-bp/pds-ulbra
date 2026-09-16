/**
 * O que o jsdom nao tem e o Radix precisa.
 *
 * O `Select` do Radix desenha a propria lista, e para isso usa captura de
 * ponteiro, rolagem ate o item e observacao de tamanho — tres coisas que o jsdom
 * nao implementa. Sem estes remendos o componente simplesmente nao abre, e o
 * teste falharia por causa do ambiente e nao do codigo.
 *
 * Mora em `src/test/` porque e ferramenta de teste, e nao codigo de producao: a
 * varredura de arquitetura nao olha esta pasta, e nada de `src/` importa daqui.
 */
export function instalarRemendosDoRadix() {
  const elemento = window.HTMLElement.prototype as unknown as Record<string, unknown>

  elemento.hasPointerCapture ??= () => false
  elemento.setPointerCapture ??= () => undefined
  elemento.releasePointerCapture ??= () => undefined
  elemento.scrollIntoView ??= () => undefined

  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // O Radix mede o gatilho para posicionar a lista; sem `DOMRect` a medicao
  // explode antes de a lista aparecer.
  window.DOMRect ??= class {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    top = 0
    right = 0
    bottom = 0
    left = 0
    toJSON() {
      return this
    }
    static fromRect() {
      return new window.DOMRect()
    }
  } as unknown as typeof DOMRect
}

/**
 * Escolhe um valor numa caixa de escolha do produto.
 *
 * A lista e desenhada por nos, entao nao ha `select` nativo para receber um
 * `change`: abre-se o gatilho e clica-se na opcao, que e o que a pessoa faz.
 */
export async function escolherNoSelect(
  screen: { getByRole: (role: string, options?: { name?: string | RegExp }) => HTMLElement },
  fireEvent: { pointerDown: (el: Element, init?: object) => void; click: (el: Element) => void },
  nomeDoCampo: string,
  rotuloDaOpcao: string | RegExp,
) {
  const gatilho = screen.getByRole('combobox', { name: nomeDoCampo })

  // O Radix abre no `pointerdown`, e nao no clique.
  fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false, pointerType: 'mouse' })

  const opcao = screen.getByRole('option', { name: rotuloDaOpcao })
  fireEvent.click(opcao)
}
