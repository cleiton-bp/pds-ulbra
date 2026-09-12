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
 * A luminancia das duas tintas de `tokens.css`, para a conta poder ser feita
 * aqui. Sao numeros, e nao cores: `designSystem.test.ts` proibe cor crua fora de
 * `tokens.css`, e com razao — quem mudar `--ink-on-light` ou `--ink-on-dark`
 * precisa reconhecer estes dois, e `appearance.test.ts` reprova se eles sairem
 * de sincronia com o contraste que prometem.
 */
const INK_ON_LIGHT_LUMINANCE = 0.014_07
const INK_ON_DARK_LUMINANCE = 1

/** A razao de contraste da WCAG entre duas luminancias. */
function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * **Nao ha limiar.** Havia — um `0.45` escolhido no olho — e ele estava acima do
 * ponto em que as duas tintas empatam (L ~= 0,209), entao toda a faixa media
 * recebia tinta clara: um laranja de marca comum ficava em 2,3:1 quando a tinta
 * escura daria 7,2:1. Numero escolhido no olho para uma conta que tem resposta
 * exata e so um jeito elegante de errar.
 *
 * Agora as duas sao medidas e ganha a de maior contraste. O ponto de virada sai
 * sozinho da conta, e acompanha qualquer mudanca nas tintas.
 */
function inkFor(accentLuminance: number): string {
  const comTintaEscura = contrast(accentLuminance, INK_ON_LIGHT_LUMINANCE)
  const comTintaClara = contrast(accentLuminance, INK_ON_DARK_LUMINANCE)

  return comTintaEscura >= comTintaClara
    ? 'var(--widget-ink-on-light)'
    : 'var(--widget-ink-on-dark)'
}

export function accentStyle(settings: WidgetSettingsViewModel): CSSProperties {
  if (!isUsableAccent(settings.AccentColor)) {
    return {
      '--widget-accent': 'var(--accent)',
      '--widget-ink': 'var(--accent-fg)',
    } as CSSProperties
  }

  const accent = settings.AccentColor.trim()

  return {
    '--widget-accent': accent,
    '--widget-ink': inkFor(relativeLuminance(accent)),
  } as CSSProperties
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
