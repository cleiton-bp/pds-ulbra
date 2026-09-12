import type { CSSProperties } from 'react'
import type { WidgetSettingsViewModel, WidgetTheme } from '@/contracts'

/**
 * A aparencia do quadro a partir da configuracao do cliente.
 *
 * Duas regras moram aqui, e as duas existem porque a cor vem de fora:
 *
 * 1. **A cor do texto sobre o acento e derivada, nunca escolhida.** Quem escolhe
 *    amarelo nao deveria precisar perceber sozinho que o rotulo sumiu.
 * 2. **A cor entra por variavel CSS, e nao por estilo de cor embutido.** Estilo
 *    embutido nao muda com o tema, e `designSystem.test.ts` reprova — a variavel
 *    atravessa a folha de estilo e continua sujeita a ela.
 */

/** Luminancia relativa da WCAG. Mesma conta de `designSystem.test.ts`. */
function relativeLuminance(color: string): number {
  const value = color.replace('#', '')
  const full =
    value.length === 3
      ? [...value].map((channel) => channel + channel).join('')
      : value.padEnd(6, '0').slice(0, 6)

  const channels = [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16) / 255)
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )

  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
}

/**
 * Aceita a forma curta e a longa, de tres ou seis digitos. O que nao casar cai no
 * acento do produto — cor invalida vinda do banco nao pode apagar o botao.
 *
 * (O exemplo nao se escreve aqui: `designSystem.test.ts` procura cor crua em todo
 * arquivo e nao distingue comentario de codigo, o que esta certo.)
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function isUsableAccent(color: string | null): color is string {
  return typeof color === 'string' && HEX.test(color.trim())
}

/**
 * O limiar e 0,45 e nao 0,5: a conta da luminancia ja pesa o verde, e no meio da
 * escala a tinta clara aguenta um pouco mais de fundo claro do que o contrario.
 */
const LIGHT_ENOUGH_FOR_DARK_INK = 0.45

/**
 * As duas variaveis que o quadro consome. Quando o cliente nao escolheu cor, as
 * duas apontam para o acento do produto e o tema resolve sozinho.
 */
export function accentStyle(settings: WidgetSettingsViewModel): CSSProperties {
  if (!isUsableAccent(settings.AccentColor)) {
    return {
      '--widget-accent': 'var(--accent)',
      '--widget-ink': 'var(--accent-fg)',
    } as CSSProperties
  }

  const accent = settings.AccentColor.trim()
  const ink =
    relativeLuminance(accent) > LIGHT_ENOUGH_FOR_DARK_INK
      ? 'var(--widget-ink-on-light)'
      : 'var(--widget-ink-on-dark)'

  return { '--widget-accent': accent, '--widget-ink': ink } as CSSProperties
}

/**
 * `Auto` **nao** da para resolver deixando o atributo de fora: `tokens.css` so
 * tem bloco escuro para `[data-theme="dark"]`, e nao responde a
 * `prefers-color-scheme` sozinho. Sem esta conta, `Auto` seria sempre claro.
 *
 * E a mesma precedencia do painel (`app/themeStore.ts`), menos a parte guardada:
 * aqui nao ha escolha de quem visita para lembrar — quem escolhe e o cliente, na
 * configuracao do projeto dele.
 */
export function resolveTheme(theme: WidgetTheme): 'light' | 'dark' {
  if (theme === 'Light') return 'light'
  if (theme === 'Dark') return 'dark'
  return prefersDark() ? 'dark' : 'light'
}

function prefersDark(): boolean {
  // `matchMedia` falta em ambiente de teste sem DOM; claro e o padrao seguro.
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

/**
 * So `Auto` acompanha a troca depois de carregado. Devolve como desinscrever, e
 * nao faz nada quando o cliente fixou o tema — ouvir o sistema para ignorar o
 * que ele disser e o tipo de ouvinte que fica.
 */
export function watchSystemTheme(
  theme: WidgetTheme,
  onChange: (resolved: 'light' | 'dark') => void,
): () => void {
  if (theme !== 'Auto' || typeof window === 'undefined' || !window.matchMedia) return () => {}

  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const listener = (event: MediaQueryListEvent) => onChange(event.matches ? 'dark' : 'light')
  query.addEventListener('change', listener)

  return () => query.removeEventListener('change', listener)
}
