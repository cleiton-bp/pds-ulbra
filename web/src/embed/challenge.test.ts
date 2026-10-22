import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { leadingZeroBits, sha256, solveChallenge } from '@/embed/challenge'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O nonce achado aqui passa na conferencia da API.** A conta e refeita no teste com
 * o SHA-256 do Node, e nao com o daqui: um erro no hash escrito a mao produziria um
 * nonce que so este arquivo aceita.
 *
 * A dificuldade fica baixa, para o teste rodar em milissegundos.
 */
afterEach(() => {
  vi.restoreAllMocks()
})

/** Os bits zero do comeco do SHA-256 de `texto`, pelo Node. */
function bitsZeroPeloNode(texto: string): number {
  const hash = createHash('sha256').update(texto, 'utf8').digest()
  let total = 0
  for (const byte of hash) {
    if (byte === 0) {
      total += 8
      continue
    }
    return total + Math.clz32(byte) - 24
  }
  return total
}

function hex(palavras: Uint32Array): string {
  return Array.from(palavras, (p) => p.toString(16).padStart(8, '0')).join('')
}

function nodeHex(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex')
}

describe('sha256', () => {
  const codificar = new TextEncoder()

  it('bate com os vetores conhecidos', () => {
    expect(hex(sha256(codificar.encode('')))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(hex(sha256(codificar.encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('bate com o do Node em mensagens de mais de um bloco e com acento', () => {
    for (const texto of [
      'a'.repeat(55),
      'a'.repeat(56),
      'a'.repeat(64),
      'b'.repeat(200),
      'ação 🐞',
    ]) {
      expect(hex(sha256(codificar.encode(texto)))).toBe(nodeHex(texto))
    }
  })
})

describe('leadingZeroBits', () => {
  it('conta os bits zero do comeco, atravessando as palavras', () => {
    expect(leadingZeroBits(new Uint32Array([0x80000000, 0]))).toBe(0)
    expect(leadingZeroBits(new Uint32Array([1, 0]))).toBe(31)
    expect(leadingZeroBits(new Uint32Array([0, 0x00ffffff]))).toBe(40)
    expect(leadingZeroBits(new Uint32Array(8))).toBe(256)
  })
})

describe('solveChallenge', () => {
  it('acha um nonce que passa na conferencia, refeita pelo Node', async () => {
    const bilhete = 'bilhete-de-teste.abc123'
    const dificuldade = 10

    const nonce = await solveChallenge(bilhete, dificuldade)

    expect(nonce).toMatch(/^\d+$/)
    expect(bitsZeroPeloNode(bilhete + nonce)).toBeGreaterThanOrEqual(dificuldade)
  })

  it('devolve o primeiro nonce que serve', async () => {
    const bilhete = 'outro-bilhete'
    const nonce = Number(await solveChallenge(bilhete, 6))

    for (let anterior = 0; anterior < nonce; anterior++) {
      expect(bitsZeroPeloNode(bilhete + anterior)).toBeLessThan(6)
    }
  })

  it('dificuldade zero aceita o primeiro', async () => {
    await expect(solveChallenge('qualquer', 0)).resolves.toBe('0')
  })

  it('desiste quando o envio deixou de valer', async () => {
    const cancelado = vi.fn(() => true)
    await expect(solveChallenge('bilhete', 64, cancelado)).rejects.toThrow('cancelado')
    expect(cancelado).toHaveBeenCalledTimes(1)
  })

  it('desiste depois do tempo maximo', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(90_001)
    await expect(solveChallenge('bilhete', 64)).rejects.toThrow('demorou')
  })
})
