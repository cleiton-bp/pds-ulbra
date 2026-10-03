import { describe, expect, it } from 'vitest'
import { daysUntil, dueState, dueWords } from '@/shared/lib/dueDate'

/**
 * O QUE ESTES TESTES TRAVAM: o prazo conta em dias do calendario de quem olha.
 *
 * - **Vencido e o dia que ja passou**, perto e hoje ou ate `soonDays` dias, e o resto
 *   ainda tem tempo — e o vencido nao depende da regra do projeto.
 * - **As palavras sempre acompanham a cor**: "vence hoje", "vence amanhã", "venceu há
 *   3 dias".
 * - **Meia-noite nao muda o dia**: as 23h59 de hoje o prazo de amanha ainda e amanha.
 */
const HOJE = new Date(2026, 9, 16, 9, 30)

describe('o prazo do card', () => {
  it('conta os dias do calendario, e nao as horas', () => {
    expect(daysUntil('2026-10-16', HOJE)).toBe(0)
    expect(daysUntil('2026-10-17', new Date(2026, 9, 16, 23, 59))).toBe(1)
    expect(daysUntil('2026-10-13', HOJE)).toBe(-3)
    expect(daysUntil('16/10/2026', HOJE)).toBeNull()
  })

  it('vencido, perto ou com tempo — e o vencido nao depende da regra', () => {
    expect(dueState('2026-10-15', 2, HOJE)).toBe('overdue')
    expect(dueState('2026-10-15', 0, HOJE)).toBe('overdue')
    expect(dueState('2026-10-16', 0, HOJE)).toBe('soon')
    expect(dueState('2026-10-18', 2, HOJE)).toBe('soon')
    expect(dueState('2026-10-19', 2, HOJE)).toBe('later')
  })

  it('as palavras dizem o que a cor diz', () => {
    expect(dueWords('2026-10-15', 2, HOJE)).toBe('venceu ontem')
    expect(dueWords('2026-10-13', 2, HOJE)).toBe('venceu há 3 dias')
    expect(dueWords('2026-10-16', 2, HOJE)).toBe('vence hoje')
    expect(dueWords('2026-10-17', 2, HOJE)).toBe('vence amanhã')
    expect(dueWords('2026-10-18', 2, HOJE)).toBe('vence em 2 dias')
    expect(dueWords('2026-10-19', 2, HOJE)).toBeNull()
  })
})
