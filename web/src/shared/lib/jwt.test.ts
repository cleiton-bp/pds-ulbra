import { describe, expect, it } from 'vitest'
import { decodeJwtPayload } from '@/shared/lib/jwt'

/**
 * JWT de mentira. O `TextEncoder` nao e detalhe: JWT carrega UTF-8, e `btoa`
 * sozinho gravaria um byte por caractere — o teste de acento estaria testando um
 * token que o Google nunca emitiria.
 */
function buildToken(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value))
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  return `${encode({ alg: 'RS256' })}.${encode(payload)}.assinatura-que-ninguem-confere-aqui`
}

describe('decodeJwtPayload', () => {
  it('le o miolo de um token bem formado', () => {
    const claims = decodeJwtPayload(
      buildToken({ sub: '10987', name: 'Maria', email: 'maria@exemplo.com' }),
    )

    expect(claims?.sub).toBe('10987')
    expect(claims?.name).toBe('Maria')
  })

  it('le nome com acento', () => {
    const claims = decodeJwtPayload(buildToken({ name: 'João Gonçalves' }))
    expect(claims?.name).toBe('João Gonçalves')
  })

  it('devolve nulo em vez de quebrar quando o token nao presta', () => {
    expect(decodeJwtPayload('')).toBeNull()
    expect(decodeJwtPayload('so.duas')).toBeNull()
    expect(decodeJwtPayload('a.b.c')).toBeNull()
  })
})
