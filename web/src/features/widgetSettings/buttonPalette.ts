/**
 * As cores que O botão oferece num clique, para o botao e para o texto dele.
 *
 * **Sao dado, e nao tema.** A cor vai gravada na configuracao e pinta o botao no
 * sistema do cliente, igual nos dois temas: um token que mudasse com o tema do painel
 * gravaria uma cor diferente conforme a hora em que se escolheu. Por isso o valor e
 * escrito aqui, e nao lido da folha de estilo.
 *
 * **Nao sao cores inventadas**: cada uma e um primitivo do tema claro de `tokens.css`
 * (a paleta de dado, a mesma das etiquetas). `designSystem.test.ts` audita esta lista
 * e reprova cor que nao esteja la — cor nova entra la primeiro.
 */

export interface PaletteColor {
  /** O nome na tela, e o que o leitor de tela anuncia. */
  name: string
  value: string
}

/** As cores do botao, na ordem das amostras. */
export const BUTTON_COLORS: readonly PaletteColor[] = [
  { name: 'Azul', value: '#0d74ce' },
  { name: 'Verde', value: '#2a7e3b' },
  { name: 'Vermelho', value: '#ce2c31' },
  { name: 'Laranja', value: '#cc4e00' },
  { name: 'Mostarda', value: '#9e6c00' },
  { name: 'Roxo', value: '#8145b5' },
  { name: 'Rosa', value: '#c2298a' },
  { name: 'Grafite', value: '#1c2024' },
]

/** As cores do texto: as duas tintas que o painel ja usa sobre cor de cliente. */
export const TEXT_COLORS: readonly PaletteColor[] = [
  { name: 'Branco', value: '#ffffff' },
  { name: 'Grafite', value: '#1c2024' },
]

/** A cor da lista com este valor, sem diferenca de caixa. */
export function paletteColor(
  colors: readonly PaletteColor[],
  value: string | null,
): PaletteColor | undefined {
  if (value === null) return undefined
  const procurado = value.trim().toLowerCase()
  return colors.find((cor) => cor.value === procurado)
}

/**
 * O que a pessoa escreveu no campo do codigo, como cor: seis digitos, ou tres, com ou
 * sem a cerquilha. Nulo quando nao e cor — o campo diz o que falta.
 */
export function parseHexColor(text: string): string | null {
  const digitos = text.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(digitos)) return `#${digitos}`
  if (/^[0-9a-f]{3}$/.test(digitos)) {
    const [r, g, b] = digitos
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return null
}
