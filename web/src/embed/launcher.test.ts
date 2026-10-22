import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OFFSET,
  isHiddenPage,
  isNarrowViewport,
  LAUNCHER_MAX_WIDTH,
  type LauncherSettings,
  launcherFrame,
  launcherMode,
  launcherRadius,
  launcherSize,
  NARROW_VIEWPORT,
  placeFrame,
  readResize,
} from '@/embed/launcher'
import { FRAME_SIZE, MESSAGE_SOURCE, type ResizeMessage } from '@/embed/protocol'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * As contas que o carregador, a previa e o quadro dividem: as paginas escondidas, a
 * regra do celular, o tamanho do botao e onde o quadro fica na janela. Uma conta
 * errada aqui erra nos tres lugares de uma vez.
 */
const base: LauncherSettings = {
  Position: 'BottomRight',
  OffsetX: 20,
  OffsetY: 20,
  LauncherIcon: 'Chat',
  LauncherIconOnly: false,
  LauncherSize: 'Medium',
  LauncherShape: 'Pill',
  LauncherShadow: false,
  MobileMode: 'Same',
  HiddenPaths: [],
}

function pedido(campos: Partial<ResizeMessage> = {}): ResizeMessage {
  return {
    source: MESSAGE_SOURCE,
    type: 'resize',
    width: 160,
    height: 48,
    position: 'BottomRight',
    ...campos,
  }
}

describe('isHiddenPage', () => {
  it('sem lista ou sem caminho, nada se esconde', () => {
    expect(isHiddenPage(null, '/checkout')).toBe(false)
    expect(isHiddenPage(undefined, '/checkout')).toBe(false)
    expect(isHiddenPage([], '/checkout')).toBe(false)
    expect(isHiddenPage(['/checkout'], null)).toBe(false)
    expect(isHiddenPage(['/checkout'], '')).toBe(false)
  })

  it('caminho exato: so essa pagina, sem diferenca de maiuscula nem da barra do fim', () => {
    const lista = ['/checkout']
    expect(isHiddenPage(lista, '/checkout')).toBe(true)
    expect(isHiddenPage(lista, '/Checkout/')).toBe(true)
    expect(isHiddenPage(['/Checkout/'], '/checkout')).toBe(true)
    expect(isHiddenPage(lista, '/checkout/pagar')).toBe(false)
    expect(isHiddenPage(lista, '/checkouts')).toBe(false)
  })

  it('`/area/*` vale para a propria area e tudo embaixo dela', () => {
    const lista = ['/login/*']
    expect(isHiddenPage(lista, '/login')).toBe(true)
    expect(isHiddenPage(lista, '/login/')).toBe(true)
    expect(isHiddenPage(lista, '/login/senha')).toBe(true)
    expect(isHiddenPage(lista, '/loginx')).toBe(false)
    expect(isHiddenPage(lista, '/')).toBe(false)
  })

  it('`/prefixo*` vale para tudo o que comeca assim', () => {
    const lista = ['/ajuda*']
    expect(isHiddenPage(lista, '/ajuda')).toBe(true)
    expect(isHiddenPage(lista, '/ajuda-rapida')).toBe(true)
    expect(isHiddenPage(lista, '/aj')).toBe(false)
  })

  it('`/` so esconde a pagina inicial, e `/*` esconde todas', () => {
    expect(isHiddenPage(['/'], '/')).toBe(true)
    expect(isHiddenPage(['/'], '/produtos')).toBe(false)
    expect(isHiddenPage(['/*'], '/produtos/1')).toBe(true)
  })

  it('o caminho com acento casa escrito de um jeito ou de outro: o navegador manda com %XX', () => {
    expect(isHiddenPage(['/promoção'], '/promo%C3%A7%C3%A3o')).toBe(true)
    expect(isHiddenPage(['/promo%C3%A7%C3%A3o'], '/promoção')).toBe(true)
    expect(isHiddenPage(['/promoção/*'], '/promo%C3%A7%C3%A3o/dia')).toBe(true)
    expect(isHiddenPage(['/Promoção'], '/promo%C3%A7%C3%A3o')).toBe(true)
    // `%` solto nao decodifica, e vale como veio — sem derrubar.
    expect(isHiddenPage(['/100%'], '/100%')).toBe(true)
    expect(isHiddenPage(['/promoção'], '/promocao')).toBe(false)
  })

  it('basta um item da lista casar', () => {
    expect(isHiddenPage(['/a', '/b/*', '/c'], '/b/x')).toBe(true)
  })

  it('item que nao comeca com barra, ou que nao e texto, e ignorado sem derrubar', () => {
    expect(isHiddenPage(['checkout'], '/checkout')).toBe(false)
    expect(isHiddenPage([42, null, '/x'] as unknown as string[], '/x')).toBe(true)
    expect(isHiddenPage([42] as unknown as string[], '/x')).toBe(false)
  })
})

describe('placeFrame', () => {
  const janela = { width: 1024, height: 768 }

  it('botao no canto de baixo a direita: so `bottom` e `right`', () => {
    expect(
      placeFrame(pedido({ offsetX: 24, offsetY: 30, radius: 12, shadow: true }), janela),
    ).toEqual({
      width: 160,
      height: 48,
      top: null,
      bottom: 30,
      left: null,
      right: 24,
      radius: 12,
      shadow: 'launcher',
    })
  })

  it('cada canto escreve as suas duas bordas, e apaga as outras', () => {
    const emCimaEsquerda = placeFrame(pedido({ position: 'TopLeft' }), janela)
    expect(emCimaEsquerda).toMatchObject({ top: 20, left: 20, bottom: null, right: null })

    const emCimaDireita = placeFrame(pedido({ position: 'TopRight' }), janela)
    expect(emCimaDireita).toMatchObject({ top: 20, right: 20, bottom: null, left: null })

    const emBaixoEsquerda = placeFrame(pedido({ position: 'BottomLeft' }), janela)
    expect(emBaixoEsquerda).toMatchObject({ bottom: 20, left: 20, top: null, right: null })
  })

  it('sem distancia, cantos nem sombra na mensagem, usa os de sempre', () => {
    expect(placeFrame(pedido(), janela)).toMatchObject({
      bottom: DEFAULT_OFFSET,
      right: DEFAULT_OFFSET,
      radius: 999,
      shadow: 'none',
    })
  })

  it('o formulario aberto tem cantos e sombra proprios, seja o que for que o botao pediu', () => {
    const aberto = placeFrame(pedido({ ...FRAME_SIZE.expanded, radius: 0, shadow: false }), janela)
    expect(aberto).toMatchObject({ ...FRAME_SIZE.expanded, radius: 14, shadow: 'open' })
  })

  it('numa janela menor que o pedido, o quadro cabe nela e a distancia vale ate onde da', () => {
    const lugar = placeFrame(pedido({ ...FRAME_SIZE.expanded, offsetX: 100, offsetY: 100 }), {
      width: 375,
      height: 513,
    })
    // 375 - 2 * 20 de margem, e 513 - 2 * 20.
    expect(lugar.width).toBe(335)
    expect(lugar.height).toBe(473)
    // Sobram 40 em cada eixo: a distancia de 100 cai para 40, e o quadro nao sai da janela.
    expect(lugar.right).toBe(40)
    expect(lugar.bottom).toBe(40)
    // Continua sendo o formulario aberto: a decisao e pelo tamanho pedido.
    expect(lugar.shadow).toBe('open')
  })

  it('janela minuscula nao produz tamanho negativo', () => {
    const lugar = placeFrame(pedido(), { width: 10, height: 10 })
    expect(lugar.width).toBe(0)
    expect(lugar.height).toBe(0)
    expect(lugar.right).toBeGreaterThanOrEqual(0)
    expect(lugar.bottom).toBeGreaterThanOrEqual(0)
  })
})

describe('os tamanhos do botao', () => {
  it('cada tamanho tem as suas medidas, e o desconhecido cai no medio', () => {
    expect(launcherSize('Small').button).toBe(32)
    expect(launcherSize('Medium').button).toBe(40)
    expect(launcherSize('Large').button).toBe(48)
    expect(launcherSize('Gigante' as never)).toEqual(launcherSize('Medium'))
  })

  it('os cantos: o de dentro e o de fora menos o anel', () => {
    expect(launcherRadius('Pill')).toEqual({ frame: 999, button: 999 })
    expect(launcherRadius('Rounded')).toEqual({ frame: 12, button: 8 })
    expect(launcherRadius('Square')).toEqual({ frame: 0, button: 0 })
  })

  it('texto curto fica no minimo de sempre; a altura e o botao mais o anel', () => {
    const quadro = launcherFrame(base, 'full', 40)
    expect(quadro.width).toBe(160)
    expect(quadro.height).toBe(48)
  })

  it('a largura acompanha o texto, arredondada para cima, ate o teto', () => {
    // 16 * 2 de margem + 18 + 8 do icone + o texto + 4 * 2 do anel.
    expect(launcherFrame(base, 'full', 200).width).toBe(266)
    expect(launcherFrame(base, 'full', 200.2).width).toBe(267)
    expect(launcherFrame(base, 'full', 2000).width).toBe(LAUNCHER_MAX_WIDTH)
  })

  it('sem icone, a conta nao reserva o espaco dele', () => {
    expect(launcherFrame({ ...base, LauncherIcon: 'None' }, 'full', 200).width).toBe(240)
  })

  it('so o icone, o quadro e quadrado', () => {
    expect(launcherFrame(base, 'icon', 500)).toMatchObject({ width: 48, height: 48 })
    expect(launcherFrame({ ...base, LauncherSize: 'Small' }, 'icon', 0)).toMatchObject({
      width: 40,
      height: 40,
    })
    expect(launcherFrame({ ...base, LauncherSize: 'Large' }, 'icon', 0)).toMatchObject({
      width: 56,
      height: 56,
    })
  })

  it('leva canto, sombra e cantos da forma, com a distancia no intervalo', () => {
    const quadro = launcherFrame(
      {
        ...base,
        Position: 'TopLeft',
        OffsetX: 500,
        OffsetY: -5,
        LauncherShape: 'Rounded',
        LauncherShadow: true,
      },
      'full',
      0,
    )
    expect(quadro).toMatchObject({
      position: 'TopLeft',
      offsetX: 200,
      offsetY: 0,
      radius: 12,
      shadow: true,
    })
  })
})

describe('a regra do celular', () => {
  it('janela estreita e a abaixo do limite; sem medida, e computador', () => {
    expect(isNarrowViewport(NARROW_VIEWPORT - 1)).toBe(true)
    expect(isNarrowViewport(NARROW_VIEWPORT)).toBe(false)
    expect(isNarrowViewport(null)).toBe(false)
    expect(isNarrowViewport(undefined)).toBe(false)
    expect(isNarrowViewport(0)).toBe(false)
    expect(isNarrowViewport(Number.NaN)).toBe(false)
  })

  it('`Same` mostra o mesmo botao no celular e no computador', () => {
    expect(launcherMode(base, '/', 375)).toBe('full')
    expect(launcherMode(base, '/', 1280)).toBe('full')
  })

  it('`Hidden` esconde so no celular', () => {
    const settings = { ...base, MobileMode: 'Hidden' as const }
    expect(launcherMode(settings, '/', 375)).toBe('hidden')
    expect(launcherMode(settings, '/', 1280)).toBe('full')
    expect(launcherMode(settings, '/', null)).toBe('full')
  })

  it('`IconOnly` vira so o icone no celular, e o texto volta no computador', () => {
    const settings = { ...base, MobileMode: 'IconOnly' as const }
    expect(launcherMode(settings, '/', 375)).toBe('icon')
    expect(launcherMode(settings, '/', 1280)).toBe('full')
  })

  it('sem icone nao ha botao so de icone: mostra o texto', () => {
    expect(launcherMode({ ...base, MobileMode: 'IconOnly', LauncherIcon: 'None' }, '/', 375)).toBe(
      'full',
    )
    expect(launcherMode({ ...base, LauncherIconOnly: true, LauncherIcon: 'None' }, '/', 1280)).toBe(
      'full',
    )
  })

  it('so o icone escolhido vale em qualquer janela', () => {
    expect(launcherMode({ ...base, LauncherIconOnly: true }, '/', 1280)).toBe('icon')
  })

  it('a pagina escondida vence tudo', () => {
    expect(launcherMode({ ...base, HiddenPaths: ['/checkout'] }, '/checkout', 1280)).toBe('hidden')
    expect(launcherMode({ ...base, HiddenPaths: ['/checkout'] }, '/inicio', 1280)).toBe('full')
  })
})

describe('readResize', () => {
  it('recusa o que nao e `resize` ou nao traz tamanho valido', () => {
    expect(readResize(null)).toBeNull()
    expect(readResize({ type: 'open', width: 10, height: 10 })).toBeNull()
    expect(readResize({ type: 'resize', width: '10', height: 10 })).toBeNull()
    expect(readResize({ type: 'resize', width: 10, height: 0 })).toBeNull()
    expect(readResize({ type: 'resize', width: Number.POSITIVE_INFINITY, height: 10 })).toBeNull()
  })

  it('o quadro antigo, so com tamanho, fica no lugar de sempre', () => {
    expect(readResize({ type: 'resize', width: 160, height: 48 })).toEqual({
      source: MESSAGE_SOURCE,
      type: 'resize',
      width: 160,
      height: 48,
      position: 'BottomRight',
      offsetX: DEFAULT_OFFSET,
      offsetY: DEFAULT_OFFSET,
      radius: 999,
      shadow: false,
    })
  })

  it('canto desconhecido e distancia fora do intervalo caem no combinado', () => {
    expect(
      readResize({
        type: 'resize',
        width: 160,
        height: 48,
        position: 'Meio',
        offsetX: 9999,
        offsetY: -3,
        radius: 5000,
        shadow: 'sim',
      }),
    ).toMatchObject({
      position: 'BottomRight',
      offsetX: 200,
      offsetY: 0,
      radius: 999,
      shadow: false,
    })
  })
})
