/**
 * Os números da tela de Mídia: o que se digita, e o que vai para a API.
 *
 * **O campo guarda texto, e só vira número quando serve.** Converter a cada tecla
 * faria o campo apagado pular para o mínimo, e o dígito seguinte grudar nele:
 * apagar "4" para digitar "3" viraria "13".
 */

export const BYTES_PER_MB = 1024 * 1024

/**
 * Casas decimais do tamanho em MB.
 *
 * **Uma, e é a mesma que o quadro usa para dizer o limite** (`formatBytes`). Com
 * mais casas aqui, a tela salvaria 5,25 MB e a pessoa lá fora leria "passa de
 * 5.3 MB".
 */
export const MB_DECIMALS = 1

export interface LimitRange {
  min: number
  max: number
  /** Zero para campo inteiro. */
  decimals: 0 | 1
}

/**
 * O número que o texto diz, ou `null` se ele não serve para este campo.
 *
 * **Recusa em vez de arredondar.** Campo inteiro com "2.5" iria para a API como
 * está e voltaria um 400 genérico; arredondar em silêncio gravaria um número que
 * ninguém digitou. Fora da faixa também é `null`: o teto já está escrito na tela,
 * e esperar o servidor recusar é descobrir tarde.
 */
export function parseLimit(text: string, range: LimitRange): number | null {
  const normalized = text.trim().replace(',', '.')

  // Sem sinal, sem expoente: "1e3" é número para o navegador, e não para quem
  // configura um limite.
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null

  const value = Number(normalized)
  const scale = 10 ** range.decimals

  if (Math.round(value * scale) / scale !== value) return null
  if (value < range.min || value > range.max) return null

  return value
}

/** O que o campo precisa ter, dito para quem digitou outra coisa. */
export function limitHint(range: LimitRange): string {
  return range.decimals === 0
    ? `Use um número inteiro de ${range.min} a ${range.max}.`
    : `Use um número de ${range.min} a ${range.max}, com até uma casa decimal.`
}

/** MB digitado para os bytes que o banco guarda. */
export function bytesFromMegabytes(megabytes: number): number {
  return Math.round(megabytes * BYTES_PER_MB)
}

/**
 * Casas decimais que bastam para qualquer quantidade de bytes.
 *
 * Com sete, o arredondamento erra menos de um décimo de byte, e por isso a volta
 * para bytes sempre cai no mesmo número.
 */
const MAX_MB_DECIMALS = 7

/**
 * Os bytes do banco, em MB, sem esconder o valor salvo.
 *
 * **A menor quantidade de casas que volta aos mesmos bytes.** O que esta tela
 * grava cabe em uma. Um valor gravado de outro jeito ganha as casas que precisar,
 * e nem uma a mais: 5295309 aparece como 5.05, e não como 5.1, que seria a tela
 * dizendo um limite e o servidor cobrando outro, nem como 5.050000190734863, que
 * ninguém lê.
 */
export function megabytesFromBytes(bytes: number): number {
  const exact = bytes / BYTES_PER_MB

  for (let decimals = MB_DECIMALS; decimals <= MAX_MB_DECIMALS; decimals++) {
    const rounded = Number(exact.toFixed(decimals))

    if (bytesFromMegabytes(rounded) === bytes) return rounded
  }

  return exact
}
