/**
 * Mesmo formato de `Pds.Service/Security/ProjectKeyGenerator.cs` — o prefixo tem
 * 11 caracteres, e tela desenhada contra chave de outro tamanho quebra de leve
 * quando a API entrar.
 *
 * O valor da secreta sai daqui uma vez e nao e guardado em lugar nenhum.
 */

export const PUBLIC_TAG = 'pk_'
export const SECRET_TAG = 'sk_'

/** A marca mais oito caracteres do sorteio. */
export const PREFIX_LENGTH = 11

/** Base64 URL-safe sem `=`, o mesmo tratamento da API. */
function randomToken(byteCount: number): string {
  const bytes = new Uint8Array(byteCount)
  crypto.getRandomValues(bytes)

  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function extractPrefix(value: string): string {
  return value.slice(0, PREFIX_LENGTH)
}

function generate(tag: string, byteCount: number): { value: string; prefix: string } {
  const value = tag + randomToken(byteCount)
  return { value, prefix: extractPrefix(value) }
}

/** Guardada em claro: identifica o projeto, nao autentica ninguem. */
export function generatePublicKey() {
  return generate(PUBLIC_TAG, 18)
}

export function generateSecretKey() {
  return generate(SECRET_TAG, 32)
}
