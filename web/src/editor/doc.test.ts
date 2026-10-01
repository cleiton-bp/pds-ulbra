import { describe, expect, it } from 'vitest'
import {
  clampPoint,
  commit,
  type EditDoc,
  EMPTY_DOC,
  HISTORY_LIMIT,
  isBlank,
  nextStepNumber,
  rectBetween,
  redo,
  type Shape,
  startHistory,
  undo,
} from '@/editor/doc'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **Desfazer e refazer andam nas marcas, e so nelas.** Um passo novo apaga o que
 * tinha sido desfeito; desfazer no comeco nao faz nada.
 *
 * **Reaberta, a imagem traz as marcas de antes como passos** — e e assim que a tarja
 * da primeira vez pode sair: o editor nao tem borracha.
 *
 * **Sem marca e sem recorte e o original**, e o numero do marcador segue o maior.
 */
const tarja = (x: number): Shape => ({ type: 'hide', rect: { x, y: 0, width: 10, height: 10 } })
const passo = (numero: number): Shape => ({
  type: 'step',
  at: { x: 0, y: 0 },
  number: numero,
  color: '#e5484d',
  radius: 10,
})
const com = (...shapes: Shape[]): EditDoc => ({ shapes, crop: null })

describe('a historia das marcas', () => {
  it('desfazer volta um passo, e refazer o traz de novo', () => {
    let historia = startHistory(EMPTY_DOC)
    historia = commit(historia, com(tarja(1)))
    historia = commit(historia, com(tarja(1), tarja(2)))

    historia = undo(historia)
    expect(historia.present.shapes).toEqual([tarja(1)])

    historia = redo(historia)
    expect(historia.present.shapes).toEqual([tarja(1), tarja(2)])
  })

  it('um passo novo depois de desfazer apaga o que tinha sido desfeito', () => {
    let historia = commit(startHistory(EMPTY_DOC), com(tarja(1)))
    historia = undo(historia)
    historia = commit(historia, com(tarja(9)))

    expect(historia.future).toEqual([])
    expect(redo(historia)).toBe(historia)
  })

  it('desfazer no comeco e refazer no fim nao fazem nada', () => {
    const historia = startHistory(EMPTY_DOC)
    expect(undo(historia)).toBe(historia)
    expect(redo(historia)).toBe(historia)
  })

  it('o mesmo documento nao vira passo', () => {
    const historia = startHistory(EMPTY_DOC)
    expect(commit(historia, historia.present)).toBe(historia)
  })

  it(`guarda so os ultimos ${HISTORY_LIMIT} passos`, () => {
    let historia = startHistory(EMPTY_DOC)
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) historia = commit(historia, com(tarja(i)))

    expect(historia.past).toHaveLength(HISTORY_LIMIT)
  })
})

describe('a imagem reaberta', () => {
  it('traz as marcas de antes como passos: desfazer tira uma de cada vez', () => {
    const antes = { shapes: [tarja(1), tarja(2)], crop: { x: 0, y: 0, width: 50, height: 50 } }
    let historia = startHistory(antes)

    expect(historia.present).toBe(antes)

    historia = undo(historia)
    expect(historia.present.shapes).toEqual([tarja(1)])
    historia = undo(historia)
    expect(historia.present.shapes).toEqual([])
    expect(historia.present.crop).toEqual(antes.crop)
    historia = undo(historia)
    expect(isBlank(historia.present)).toBe(true)
    expect(historia.past).toEqual([])
  })

  it('sem marcas, nao ha o que desfazer', () => {
    expect(startHistory(EMPTY_DOC).past).toEqual([])
  })
})

describe('o documento', () => {
  it('sem marca e sem recorte e o original', () => {
    expect(isBlank(EMPTY_DOC)).toBe(true)
    expect(isBlank(com(tarja(1)))).toBe(false)
    expect(isBlank({ shapes: [], crop: { x: 0, y: 0, width: 5, height: 5 } })).toBe(false)
  })

  it('o proximo marcador e um a mais que o maior, e nao pula quando o ultimo sai', () => {
    expect(nextStepNumber(EMPTY_DOC)).toBe(1)
    expect(nextStepNumber(com(passo(1), tarja(3), passo(2)))).toBe(3)
    expect(nextStepNumber(com(passo(1)))).toBe(2)
  })

  it('o retangulo entre dois pontos e o mesmo arrastando para qualquer lado', () => {
    const esperado = { x: 10, y: 20, width: 30, height: 40 }
    expect(rectBetween({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(esperado)
    expect(rectBetween({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(esperado)
    expect(rectBetween({ x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(esperado)
  })

  it('o ponto fora da imagem para na borda dela', () => {
    expect(clampPoint({ x: -5, y: 500 }, 400, 300)).toEqual({ x: 0, y: 300 })
    expect(clampPoint({ x: 120, y: 80 }, 400, 300)).toEqual({ x: 120, y: 80 })
  })
})
