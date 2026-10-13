import type { ReportChallengeViewModel, ReportRefusalViewModel } from '@/contracts'
import { isPanelError } from '@/data/errors'

/**
 * O desafio invisivel da entrada do relato, resolvido aqui no navegador.
 *
 * **A conta:** achar um numero (`nonce`) tal que o SHA-256 de `bilhete + nonce` comece
 * com `Difficulty` bits zero. A API pede isso so depois de um limite, e confere numa
 * conta so; aqui sao, em media, centenas de milhares de tentativas — um ou dois segundos
 * num celular comum, um quarto de segundo num computador.
 *
 * **O SHA-256 e escrito aqui, e nao o `crypto.subtle`.** O `subtle` e assincrono a cada
 * hash: a ida e volta custa mais que a conta, e varia muito de navegador para navegador
 * — a mesma dificuldade levaria meio segundo num e dez no outro. Em JavaScript puro a
 * conta e previsivel, e cabe em ~1 kB.
 *
 * **Em pedacos, sem travar a tela.** A busca roda em blocos e devolve a vez ao navegador
 * entre um e outro (`setTimeout`), entao o "Conferindo…" continua animando e um clique
 * em fechar e atendido.
 */

/** Quantas tentativas por bloco antes de devolver a vez: poucas dezenas de milissegundos num celular. */
const BLOCO = 8000

/** Desiste depois disto: o bilhete vence em dois minutos, e ninguem espera tanto olhando a tela. */
const TEMPO_MAXIMO_MS = 90_000

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const W = new Uint32Array(64)

/** O SHA-256 de `bytes`, nas oito palavras de 32 bits. */
export function sha256(bytes: Uint8Array): Uint32Array {
  const tamanho = bytes.length
  const total = ((tamanho + 9 + 63) >> 6) << 6
  const m = new Uint8Array(total)
  m.set(bytes)
  m[tamanho] = 0x80
  const bits = tamanho * 8
  // Mensagens deste tamanho cabem em 32 bits de comprimento; os quatro de cima ficam zero.
  m[total - 4] = (bits >>> 24) & 0xff
  m[total - 3] = (bits >>> 16) & 0xff
  m[total - 2] = (bits >>> 8) & 0xff
  m[total - 1] = bits & 0xff

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])

  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) {
      const j = o + i * 4
      W[i] =
        ((m[j] as number) << 24) |
        ((m[j + 1] as number) << 16) |
        ((m[j + 2] as number) << 8) |
        (m[j + 3] as number)
    }
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15] as number
      const b = W[i - 2] as number
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)
      W[i] = ((W[i - 16] as number) + s0 + (W[i - 7] as number) + s1) | 0
    }

    let a = h[0] as number
    let b = h[1] as number
    let c = h[2] as number
    let d = h[3] as number
    let e = h[4] as number
    let f = h[5] as number
    let g = h[6] as number
    let k = h[7] as number

    for (let i = 0; i < 64; i++) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const t1 = (k + s1 + ((e & f) ^ (~e & g)) + (K[i] as number) + (W[i] as number)) | 0
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0
      k = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }

    h[0] = ((h[0] as number) + a) | 0
    h[1] = ((h[1] as number) + b) | 0
    h[2] = ((h[2] as number) + c) | 0
    h[3] = ((h[3] as number) + d) | 0
    h[4] = ((h[4] as number) + e) | 0
    h[5] = ((h[5] as number) + f) | 0
    h[6] = ((h[6] as number) + g) | 0
    h[7] = ((h[7] as number) + k) | 0
  }

  return h
}

/** Quantos bits zero abrem o hash. */
export function leadingZeroBits(palavras: Uint32Array): number {
  let total = 0
  for (const palavra of palavras) {
    if (palavra === 0) {
      total += 32
      continue
    }
    return total + Math.clz32(palavra)
  }
  return total
}

/**
 * Procura o nonce. Devolve o numero em texto, como a API espera; recusa se passar do
 * tempo maximo ou se `cancelado()` disser que o envio deixou de valer.
 */
export async function solveChallenge(
  token: string,
  difficulty: number,
  cancelado: () => boolean = () => false,
): Promise<string> {
  const codificar = new TextEncoder()
  const fim = Date.now() + TEMPO_MAXIMO_MS
  let nonce = 0

  for (;;) {
    const limite = nonce + BLOCO
    for (; nonce < limite; nonce++) {
      if (leadingZeroBits(sha256(codificar.encode(token + nonce))) >= difficulty) {
        return String(nonce)
      }
    }
    if (cancelado()) throw new Error('cancelado')
    if (Date.now() > fim) throw new Error('demorou')
    // Devolve a vez ao navegador: a tela continua respondendo entre um bloco e outro.
    await new Promise((resolver) => setTimeout(resolver, 0))
  }
}

/** O desafio pedido numa recusa da entrada do relato, ou nulo quando a recusa e outra. */
export function challengeOf(falha: unknown): ReportChallengeViewModel | null {
  if (!isPanelError(falha) || falha.status !== 429) return null
  const recusa = falha.data as Partial<ReportRefusalViewModel> | null
  const desafio = recusa?.Reason === 'Challenge' ? recusa.Challenge : null
  return desafio && typeof desafio.Token === 'string' && typeof desafio.Difficulty === 'number'
    ? desafio
    : null
}
