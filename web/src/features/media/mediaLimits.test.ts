import { describe, expect, it } from 'vitest'
import {
  BYTES_PER_MB,
  bytesFromMegabytes,
  type LimitRange,
  limitHint,
  megabytesFromBytes,
  parseLimit,
} from '@/features/media/mediaLimits'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **Texto que nao serve vira `null`, e nunca um numero parecido.** Arredondar
 * "2.5" para 2, ou um campo vazio para o minimo, gravaria um limite que ninguem
 * digitou — e limite aqui e conta que alguem paga.
 *
 * **O MB que a tela mostra e o que ela grava sao o mesmo.** Toda casa decimal que
 * a tela aceita volta dos bytes exatamente igual; o que foi gravado fora dela
 * aparece inteiro, sem arredondar, e com as casas que precisa, sem sobrar.
 */
const inteiro: LimitRange = { min: 1, max: 10, decimals: 0 }
const megabytes: LimitRange = { min: 1, max: 50, decimals: 1 }

describe('o texto de um limite', () => {
  it('le numero inteiro dentro da faixa', () => {
    expect(parseLimit('4', inteiro)).toBe(4)
    expect(parseLimit(' 10 ', inteiro)).toBe(10)
  })

  it('campo vazio nao vira o minimo', () => {
    expect(parseLimit('', inteiro)).toBeNull()
  })

  it('campo inteiro recusa casa decimal, em vez de arredondar', () => {
    expect(parseLimit('2.5', inteiro)).toBeNull()
  })

  it('recusa fora da faixa, sinal e expoente', () => {
    expect(parseLimit('0', inteiro)).toBeNull()
    expect(parseLimit('11', inteiro)).toBeNull()
    expect(parseLimit('-3', inteiro)).toBeNull()
    expect(parseLimit('1e1', inteiro)).toBeNull()
  })

  it('o tamanho aceita uma casa decimal, com ponto ou virgula', () => {
    expect(parseLimit('5.5', megabytes)).toBe(5.5)
    expect(parseLimit('5,5', megabytes)).toBe(5.5)
    expect(parseLimit('5.50', megabytes)).toBe(5.5)
  })

  it('o tamanho recusa a segunda casa decimal', () => {
    expect(parseLimit('5.25', megabytes)).toBeNull()
  })

  it('diz o que o campo espera', () => {
    expect(limitHint(inteiro)).toBe('Use um número inteiro de 1 a 10.')
    expect(limitHint(megabytes)).toBe('Use um número de 1 a 50, com até uma casa decimal.')
  })
})

describe('MB e bytes', () => {
  it('todo tamanho que a tela aceita volta dos bytes igual', () => {
    for (let decimos = 10; decimos <= 500; decimos++) {
      const mb = decimos / 10
      expect(megabytesFromBytes(bytesFromMegabytes(mb))).toBe(mb)
    }
  })

  it('o que foi gravado fora da tela aparece inteiro, e nao arredondado', () => {
    expect(megabytesFromBytes(5.25 * BYTES_PER_MB)).toBe(5.25)
    expect(megabytesFromBytes(5_300_000)).toBe(5.054474)
  })

  // Um tamanho salvo com mais casas nao pode virar uma fila de digitos: 5295309
  // bytes e o 5.05 que alguem digitou, e nao 5.050000190734863.
  it('usa so as casas que precisa para voltar aos mesmos bytes', () => {
    expect(megabytesFromBytes(bytesFromMegabytes(5.05))).toBe(5.05)
    expect(megabytesFromBytes(bytesFromMegabytes(1.33))).toBe(1.33)
    expect(megabytesFromBytes(bytesFromMegabytes(2.125))).toBe(2.125)
  })

  it('qualquer quantidade de bytes volta dos MB igual', () => {
    for (let bytes = 1; bytes <= 50 * BYTES_PER_MB; bytes += 99_991) {
      expect(bytesFromMegabytes(megabytesFromBytes(bytes))).toBe(bytes)
    }
  })
})
