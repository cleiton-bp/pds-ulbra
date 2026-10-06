// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DueChip } from '@/shared/components/DueChip'

/**
 * O QUE ESTES TESTES TRAVAM: o destaque do prazo nunca e so cor.
 *
 * - Vencido em vermelho, perto em amarelo, **sempre com as palavras** — e com tempo,
 *   so o prazo, sem destaque.
 * - **No quadro sai o ano**, que o card estreito nao comporta.
 * - **O card que ja terminou** mostra a data sem destaque: atrasado e o que nao acabou.
 */
describe('o prazo com o destaque', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 16, 10, 0))
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('vencido: vermelho, e diz ha quanto tempo', () => {
    render(<DueChip day="2026-10-13" soonDays={2} />)
    const chip = screen.getByText(/Prazo 13 de out\. de 2026 · venceu há 3 dias/)
    expect(chip.className).toContain('chip-red')
  })

  it('o card que ja terminou: so a data, sem vermelho, sem amarelo e sem "venceu ha"', () => {
    render(<DueChip day="2026-10-13" soonDays={2} finished />)
    const vencido = screen.getByText('Prazo 13 de out. de 2026')
    expect(vencido.className).not.toContain('chip-')
    cleanup()

    render(<DueChip day="2026-10-17" soonDays={2} finished />)
    expect(screen.getByText('Prazo 17 de out. de 2026').className).not.toContain('chip-')
  })

  it('perto: amarelo, e diz quando vence', () => {
    render(<DueChip day="2026-10-17" soonDays={2} />)
    const chip = screen.getByText(/vence amanhã/)
    expect(chip.className).toContain('chip-yellow')
  })

  it('com tempo: so o prazo, sem destaque; no quadro, sem o ano — so quando e o deste ano', () => {
    render(<DueChip day="2026-10-30" soonDays={2} compact />)
    const chip = screen.getByText('Prazo 30 de out.')
    expect(chip.className).not.toContain('chip-')

    render(<DueChip day="2027-01-05" soonDays={2} compact />)
    expect(screen.getByText('Prazo 05 de jan. de 2027')).toBeTruthy()
  })
})
