import { describe, expect, it } from 'vitest'
import { isBlockedByPage, toSourceRect } from '@/embed/screenCapture'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O recorte desenhado no quadro vira o mesmo pedaco na resolucao real**, e nunca
 * sai da imagem — cortar na previa entregaria um print borrado.
 */
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
