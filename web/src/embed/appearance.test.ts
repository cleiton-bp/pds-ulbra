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
/** Os valores reais de `--ink-on-light` e `--ink-on-dark` em `tokens.css`. */
const INK_LIGHT = '#1c2024'
const INK_DARK = '#ffffff'

/** A razao de contraste da WCAG entre duas cores, para conferir a escolha. */
function razao(a: string, b: string): number {
  const luz = (hex: string) => {
    const v = hex.replace('#', '')
    const canais = [0, 2, 4].map((i) => Number.parseInt(v.slice(i, i + 2), 16) / 255)
    const lin = canais.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0)
  }
  const [x, y] = [luz(a), luz(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

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

  /**
   * O defeito que estes casos travam: havia um limiar de `0.45` escolhido no
   * olho, acima do ponto em que as duas tintas empatam (L ~= 0,209). Toda a
   * faixa media recebia tinta clara — um laranja de marca comum saia em 2,3:1
   * quando a escura daria 7,2:1. Os testes antigos so exercitavam os extremos e
   * passavam com o defeito no lugar.
   */
  const MEIO_DA_ESCALA = [
    { cor: '#fb923c', nome: 'laranja' },
    { cor: '#f59e0b', nome: 'ambar' },
    { cor: '#22c55e', nome: 'verde' },
    { cor: '#06b6d4', nome: 'ciano' },
    { cor: '#a78bfa', nome: 'violeta' },
    { cor: '#9ca3af', nome: 'cinza medio' },
    { cor: '#30a46c', nome: 'verde escuro' },
  ]

  for (const { cor, nome } of MEIO_DA_ESCALA) {
    it(`${nome} (${cor}) recebe a tinta que contrasta mais`, () => {
      const escolhida = accentStyle(com(cor))['--widget-ink' as never]
      const [aplicada, descartada] =
        escolhida === 'var(--widget-ink-on-light)' ? [INK_LIGHT, INK_DARK] : [INK_DARK, INK_LIGHT]

      expect(razao(cor, aplicada)).toBeGreaterThanOrEqual(razao(cor, descartada))
      // E nao so melhor: boa o bastante para se ler.
      expect(razao(cor, aplicada)).toBeGreaterThanOrEqual(4.5)
    })
  }

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
