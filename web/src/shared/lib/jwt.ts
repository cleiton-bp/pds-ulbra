/**
 * Le o miolo de um JWT **sem conferir assinatura**. Serve para um caso so: no
 * modo de demonstracao com Google real, preencher nome e foto do cabecalho.
 *
 * Nunca use para decidir permissao — qualquer um monta um JWT com o conteudo que
 * quiser. Quem confere a assinatura e a API, em `GoogleIdentityValidator`.
 */

export interface GoogleClaims {
  sub?: string
  name?: string
  email?: string
  picture?: string
}

export function decodeJwtPayload(token: string): GoogleClaims | null {
  const parts = token.split('.')
  const payload = parts.length === 3 ? parts[1] : null
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as GoogleClaims
  } catch {
    return null
  }
}
