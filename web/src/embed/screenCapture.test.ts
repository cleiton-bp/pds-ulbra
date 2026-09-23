import { describe, expect, it } from 'vitest'
import {
  baseType,
  bitrateFor,
  isBlockedByPage,
  pickVideoType,
  toSourceRect,
} from '@/embed/screenCapture'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O video nasce cabendo no limite.** A taxa de bits sai do teto e da duracao do
 * projeto — gravar acima dela faria a pessoa gravar um minuto e ouvir no fim que
 * passou.
 *
 * **O tipo que vai para a API e `video/webm`, exatamente.** O gravador diz
 * `video/webm;codecs=vp9`, e o tipo declarado entra na assinatura do envio: um
 * parametro a mais e a permissao recusada.
 *
 * **O recorte desenhado no quadro vira o mesmo pedaco na resolucao real**, e nunca
 * sai da imagem — cortar na previa entregaria um print borrado.
 */
describe('o formato da gravacao', () => {
  it('prefere VP9, que ocupa menos na mesma qualidade', () => {
    expect(pickVideoType(() => true)).toBe('video/webm;codecs=vp9')
  })

  it('cai para VP8, e depois para WebM sem codec declarado', () => {
    expect(pickVideoType((tipo) => tipo !== 'video/webm;codecs=vp9')).toBe('video/webm;codecs=vp8')
    expect(pickVideoType((tipo) => tipo === 'video/webm')).toBe('video/webm')
  })

  it('sem WebM, nao ha gravacao — e o unico video que a API aceita', () => {
    expect(pickVideoType(() => false)).toBeNull()
  })

  it('o tipo declarado perde os parametros de codec', () => {
    expect(baseType('video/webm;codecs=vp9')).toBe('video/webm')
    expect(baseType('video/webm')).toBe('video/webm')
  })
})

describe('a taxa de bits', () => {
  const MB = 1024 * 1024

  it('com folga no limite, fica no teto de qualidade, sem gastar mais so porque pode', () => {
    expect(bitrateFor(20 * MB, 60)).toBe(1_200_000)
  })

  it('com limite apertado, desce ate caber', () => {
    const taxa = bitrateFor(5 * MB, 120)
    expect(taxa).toBeLessThan(1_200_000)
    // Na taxa escolhida, a duracao maxima inteira cabe no teto.
    expect((taxa * 120) / 8).toBeLessThan(5 * MB)
  })

  it('nunca desce abaixo do que ainda deixa ler a tela', () => {
    expect(bitrateFor(1 * MB, 300)).toBe(150_000)
  })
})

describe('o recorte', () => {
  const exibido = { width: 500, height: 250 }
  const original = { width: 2000, height: 1000 }

  it('leva o pedaco desenhado para os pixels da captura', () => {
    expect(toSourceRect({ x: 50, y: 25, width: 100, height: 50 }, exibido, original)).toEqual({
      x: 200,
      y: 100,
      width: 400,
      height: 200,
    })
  })

  it('arrastar para a esquerda e para cima da o mesmo recorte', () => {
    expect(toSourceRect({ x: 150, y: 75, width: -100, height: -50 }, exibido, original)).toEqual({
      x: 200,
      y: 100,
      width: 400,
      height: 200,
    })
  })

  it('nunca sai da imagem', () => {
    const r = toSourceRect({ x: 450, y: 200, width: 200, height: 200 }, exibido, original)
    expect(r.x + r.width).toBeLessThanOrEqual(original.width)
    expect(r.y + r.height).toBeLessThanOrEqual(original.height)
  })
})

describe('de quem veio a recusa', () => {
  it('proibicao da pagina muda algo: o botao deve sumir', () => {
    const politica = Object.assign(new Error('Permission denied by permissions policy'), {
      name: 'NotAllowedError',
    })
    expect(isBlockedByPage(politica)).toBe(true)
    expect(isBlockedByPage(Object.assign(new Error('x'), { name: 'SecurityError' }))).toBe(true)
  })

  it('a pessoa fechando o seletor e desistencia, e nao bloqueio', () => {
    const desistiu = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
    expect(isBlockedByPage(desistiu)).toBe(false)
  })
})
