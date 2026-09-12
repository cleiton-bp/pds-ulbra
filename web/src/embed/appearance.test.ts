import { describe, expect, it } from 'vitest'
import type { WidgetSettingsViewModel } from '@/contracts'
import { accentStyle, isUsableAccent, resolveTheme } from '@/embed/appearance'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * A cor do gatilho vem do cliente, e a tinta por cima dela e **derivada**. E a
 * unica parte da aparencia que nao da para revisar olhando: quem escolher amarelo
 * so descobre que o rotulo sumiu quando alguem reclamar.
 *
 * O teste guarda os dois extremos e a borda: claro pede tinta escura, escuro pede
 * tinta clara, e o que nao for cor cai no acento do produto em vez de apagar o
 * botao.
 */
const com = (cor: string | null): WidgetSettingsViewModel => ({
  ...DEFAULT_WIDGET_SETTINGS,
  AccentColor: cor,
})

describe('a cor escolhida pelo cliente', () => {
  it('sem escolha, as duas variaveis apontam para o acento do produto', () => {
    expect(accentStyle(com(null))).toEqual({
      '--widget-accent': 'var(--accent)',
      '--widget-ink': 'var(--accent-fg)',
    })
  })

  it('cor clara recebe tinta escura', () => {
    // Amarelo vivo: o caso que faz rotulo branco desaparecer.
    expect(accentStyle(com('#f5d90a'))['--widget-ink' as never]).toBe('var(--widget-ink-on-light)')
  })

  it('cor escura recebe tinta clara', () => {
    expect(accentStyle(com('#1f3a8a'))['--widget-ink' as never]).toBe('var(--widget-ink-on-dark)')
  })

  it('aceita a forma curta de tres digitos', () => {
    expect(isUsableAccent('#fff')).toBe(true)
    expect(accentStyle(com('#fff'))['--widget-ink' as never]).toBe('var(--widget-ink-on-light)')
  })

  it('cor invalida nao apaga o botao: cai no acento do produto', () => {
    for (const invalida of ['', 'vermelho', '#12', 'rgb(0,0,0)', '#gggggg', 'f5d90a']) {
      expect(isUsableAccent(invalida)).toBe(false)
      expect(accentStyle(com(invalida))['--widget-accent' as never]).toBe('var(--accent)')
    }
  })

  it('espaco em volta nao invalida a cor', () => {
    expect(accentStyle(com('  #1f3a8a  '))['--widget-accent' as never]).toBe('#1f3a8a')
  })
})

describe('o tema do quadro', () => {
  it('escolha explicita do cliente vence o sistema de quem visita', () => {
    expect(resolveTheme('Light')).toBe('light')
    expect(resolveTheme('Dark')).toBe('dark')
  })

  it('Auto sem matchMedia cai no claro, e nao quebra', () => {
    // Ambiente sem DOM: `Auto` nao pode lancar, senao o quadro nao monta.
    expect(resolveTheme('Auto')).toBe('light')
  })
})
