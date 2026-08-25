import { describe, expect, it } from 'vitest'
import {
  extractPrefix,
  generatePublicKey,
  generateSecretKey,
  PREFIX_LENGTH,
  PUBLIC_TAG,
  SECRET_TAG,
} from '@/data/mock/keyGenerator'

/** O formato precisa bater com `ProjectKeyGenerator.cs`. */
describe('keyGenerator', () => {
  it('marca a chave publica e a secreta com prefixos diferentes', () => {
    expect(generatePublicKey().value.startsWith(PUBLIC_TAG)).toBe(true)
    expect(generateSecretKey().value.startsWith(SECRET_TAG)).toBe(true)
  })

  it('usa prefixo visivel de 11 caracteres', () => {
    expect(generatePublicKey().prefix).toHaveLength(PREFIX_LENGTH)
    expect(generateSecretKey().prefix).toHaveLength(PREFIX_LENGTH)
  })

  it('gera valor no alfabeto base64 url-safe, sem preenchimento', () => {
    const { value } = generateSecretKey()
    expect(value).toMatch(/^sk_[A-Za-z0-9\-_]+$/)
  })

  it('nao repete valor entre chamadas', () => {
    const values = new Set(Array.from({ length: 50 }, () => generateSecretKey().value))
    expect(values.size).toBe(50)
  })

  it('extrai o prefixo de um valor mais curto que o limite sem quebrar', () => {
    expect(extractPrefix('sk_abc')).toBe('sk_abc')
  })
})
