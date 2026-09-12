// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectToHost } from '@/embed/hostBridge'
import { FRAME_SIZE, MESSAGE_SOURCE } from '@/embed/protocol'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * `postMessage` e um canal aberto: qualquer script da pagina hospedeira, qualquer
 * outro quadro e qualquer aba com referencia a janela consegue mandar mensagem
 * para ca. As tres conferencias do `hostBridge` sao o que separa a pagina que nos
 * embutiu de todo o resto — e **todas as tres passam calado quando removidas**. O
 * quadro continua abrindo, o relato continua entrando, e o defeito so aparece no
 * dia em que alguem o procura de proposito.
 *
 * Por isso cada uma tem um teste que a exercita pelo caminho em que ela falha, e
 * nao pelo caminho feliz.
 */

const enviados: Array<{ mensagem: unknown; alvo: string }> = []

/** `window.parent` e somente-leitura; trocar por um dublê exige `defineProperty`. */
function fingirPagina(): void {
  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: {
      postMessage: (mensagem: unknown, alvo: string) => enviados.push({ mensagem, alvo }),
    },
  })
}

function chega(dados: unknown, origem: string, fonte: unknown = window.parent): void {
  window.dispatchEvent(
    new MessageEvent('message', { data: dados, origin: origem, source: fonte as Window }),
  )
}

const init = {
  source: MESSAGE_SOURCE,
  type: 'init',
  key: 'pk_DEMO',
  route: '/checkout',
  origin: 'loja.exemplo.com',
}

afterEach(() => {
  enviados.length = 0
  vi.restoreAllMocks()
})

describe('a ponte com a pagina hospedeira', () => {
  it('aceita o init da pagina e responde com ack para a origem dela', () => {
    fingirPagina()
    const visto = vi.fn()
    const ligacao = connectToHost(visto)

    chega(init, 'https://loja.exemplo.com')

    expect(visto).toHaveBeenCalledOnce()
    expect(enviados).toEqual([
      { mensagem: { source: MESSAGE_SOURCE, type: 'ack' }, alvo: 'https://loja.exemplo.com' },
    ])
    ligacao.stop()
  })

  it('ignora mensagem de outra janela, mesmo com o conteudo certo', () => {
    fingirPagina()
    const visto = vi.fn()
    const ligacao = connectToHost(visto)

    // Outro quadro da MESMA origem: so `event.source` o distingue.
    chega(init, 'https://loja.exemplo.com', { postMessage: () => {} })

    expect(visto).not.toHaveBeenCalled()
    expect(enviados).toEqual([])
    ligacao.stop()
  })

  it('ignora mensagem sem o nosso carimbo', () => {
    fingirPagina()
    const visto = vi.fn()
    const ligacao = connectToHost(visto)

    chega({ type: 'init', key: 'pk_DEMO' }, 'https://loja.exemplo.com')
    chega({ source: 'outro', type: 'init', key: 'pk_DEMO' }, 'https://loja.exemplo.com')
    chega(null, 'https://loja.exemplo.com')
    chega('init', 'https://loja.exemplo.com')

    expect(visto).not.toHaveBeenCalled()
    ligacao.stop()
  })

  it('guarda a origem do primeiro init e recusa um segundo de outra origem', () => {
    fingirPagina()
    const visto = vi.fn()
    const ligacao = connectToHost(visto)

    chega(init, 'https://loja.exemplo.com')
    enviados.length = 0

    // Um segundo `init`, de outro lugar, tentando reapontar as respostas.
    chega({ ...init, key: 'pk_INVASOR' }, 'https://invasor.example')

    expect(enviados).toEqual([])
    expect(visto).toHaveBeenCalledOnce()
    ligacao.stop()
  })

  it('nunca responde para curinga: sem init, nao ha para quem responder', () => {
    fingirPagina()
    const ligacao = connectToHost(vi.fn())

    // Pedir tamanho antes do `init` nao pode virar um `postMessage(msg, '*')`.
    ligacao.expand()
    ligacao.collapse()

    expect(enviados).toEqual([])
    ligacao.stop()
  })

  it('todo envio vai para a origem guardada, e nenhum para curinga', () => {
    fingirPagina()
    const ligacao = connectToHost(vi.fn())
    chega(init, 'https://loja.exemplo.com')

    ligacao.expand()
    ligacao.collapse()

    expect(enviados.map((envio) => envio.alvo)).toEqual([
      'https://loja.exemplo.com',
      'https://loja.exemplo.com',
      'https://loja.exemplo.com',
    ])
    expect(enviados.some((envio) => envio.alvo === '*')).toBe(false)
    expect(enviados[1]?.mensagem).toMatchObject({ type: 'resize', ...FRAME_SIZE.expanded })
    expect(enviados[2]?.mensagem).toMatchObject({ type: 'resize', ...FRAME_SIZE.collapsed })
    ligacao.stop()
  })

  it('recusa init sem chave: sem ela o quadro nao tem para onde mandar o relato', () => {
    fingirPagina()
    const visto = vi.fn()
    const ligacao = connectToHost(visto)

    chega({ ...init, key: '' }, 'https://loja.exemplo.com')
    chega({ ...init, key: 42 }, 'https://loja.exemplo.com')

    expect(visto).not.toHaveBeenCalled()
    ligacao.stop()
  })

  it('responde ack a cada init repetido, mas so avisa uma vez', () => {
    fingirPagina()
    const visto = vi.fn()
    const ligacao = connectToHost(visto)

    // O carregador reenvia ate o ack; se o primeiro ack se perder, o segundo
    // init tem de ser respondido — senao o reenvio nunca para.
    chega(init, 'https://loja.exemplo.com')
    chega(init, 'https://loja.exemplo.com')

    expect(enviados).toHaveLength(2)
    expect(visto).toHaveBeenCalledOnce()
    ligacao.stop()
  })

  it('para de escutar depois do stop', () => {
    fingirPagina()
    const visto = vi.fn()
    const ligacao = connectToHost(visto)

    ligacao.stop()
    chega(init, 'https://loja.exemplo.com')

    expect(visto).not.toHaveBeenCalled()
  })

  /**
   * O canto nao e detalhe de aparencia: o `iframe` nasce invisivel do lado da
   * pagina, e **e o primeiro pedido de tamanho que o revela**. Quem nao manda,
   * nao aparece — e e assim que a ferramenta desligada some sem precisar de
   * mensagem propria.
   */
  it('o show revela o quadro recolhido, no canto escolhido', () => {
    fingirPagina()
    const ligacao = connectToHost(vi.fn())

    chega(init, 'https://loja.exemplo.com')
    enviados.length = 0

    ligacao.show('BottomLeft')

    expect(enviados).toEqual([
      {
        mensagem: {
          source: MESSAGE_SOURCE,
          type: 'resize',
          ...FRAME_SIZE.collapsed,
          position: 'BottomLeft',
        },
        alvo: 'https://loja.exemplo.com',
      },
    ])
    ligacao.stop()
  })

  it('abrir e fechar continuam no canto que o show escolheu', () => {
    fingirPagina()
    const ligacao = connectToHost(vi.fn())

    chega(init, 'https://loja.exemplo.com')
    ligacao.show('BottomLeft')
    enviados.length = 0

    ligacao.expand()
    ligacao.collapse()

    // O canto viaja em toda mensagem: sem isso, o quadro abriria de um lado e
    // fecharia do outro, porque a pagina nao guarda estado nenhum.
    expect(enviados.map((enviado) => (enviado.mensagem as { position: string }).position)).toEqual([
      'BottomLeft',
      'BottomLeft',
    ])
    ligacao.stop()
  })

  it('sem show, nada e pedido — e o quadro continua invisivel na pagina', () => {
    fingirPagina()
    const ligacao = connectToHost(vi.fn())

    chega(init, 'https://loja.exemplo.com')

    // So o ack. Nenhum pedido de tamanho, entao a pagina nao revela nada.
    expect(enviados.map((enviado) => (enviado.mensagem as { type: string }).type)).toEqual(['ack'])
    ligacao.stop()
  })
})
