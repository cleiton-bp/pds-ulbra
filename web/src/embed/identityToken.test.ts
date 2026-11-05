import { describe, expect, it } from 'vitest'
import { nameFromIdentityToken } from '@/embed/identityToken'

/**
 * O QUE ESTES TESTES TRAVAM: o nome sugerido sai dos dois formatos de cracha (o JWT e a
 * assinatura simples que o carregador monta), com acento e apostrofo, e nada sai do que
 * nao e cracha.
 */
const base64Url = (texto: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(texto)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

describe('nameFromIdentityToken', () => {
  it('le o name da carga do JWT', () => {
    const jwt = `${base64Url('{"alg":"ES256"}')}.${base64Url('{"sub":"1","name":"João D\'Ávila"}')}.assinatura`
    expect(nameFromIdentityToken(jwt)).toBe("João D'Ávila")
  })

  it('le o nome da assinatura simples, a quinta parte', () => {
    const cracha = `rfh1.${base64Url('joao@x')}.1793831064.${'ab'.repeat(32)}.${base64Url("João D'Ávila")}`
    expect(nameFromIdentityToken(cracha)).toBe("João D'Ávila")
  })

  it('sem nome, ou sem cara de cracha, nao sugere nada', () => {
    expect(nameFromIdentityToken(`rfh1.${base64Url('1')}.1793831064.${'ab'.repeat(32)}`)).toBeNull()
    expect(nameFromIdentityToken('nao-e-cracha')).toBeNull()
    expect(nameFromIdentityToken(`rfh1.a.b.c.${base64Url('   ')}`)).toBeNull()
    expect(nameFromIdentityToken(null)).toBeNull()
  })
})
