import { describe, expect, it } from 'vitest'
import { formatDate, formatRelative } from '@/shared/lib/datetime'

/** Referencia fixa: teste que falha a meia-noite ensina o time a ignorar vermelho. */
const REFERENCE = new Date('2026-08-18T12:00:00.000Z')

describe('datetime', () => {
  it('formata data', () => {
    expect(formatDate('2026-08-18T12:00:00.000Z')).toContain('2026')
  })

  it('devolve travessao para data ausente ou invalida', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('nao e uma data')).toBe('—')
    expect(formatRelative(null, REFERENCE)).toBe('—')
  })

  it('descreve o passado recente em minutos e horas', () => {
    expect(formatRelative('2026-08-18T11:45:00.000Z', REFERENCE)).toContain('15')
    expect(formatRelative('2026-08-18T09:00:00.000Z', REFERENCE)).toContain('3')
  })

  it('descreve dias e meses', () => {
    expect(formatRelative('2026-08-11T12:00:00.000Z', REFERENCE)).toContain('7')
    expect(formatRelative('2026-06-18T12:00:00.000Z', REFERENCE)).toMatch(/m[eê]s/)
  })
})
