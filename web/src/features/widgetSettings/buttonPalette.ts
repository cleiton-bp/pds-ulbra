/**
 * As cores que a configuracao oferece num clique: a do botao e a do texto dele, em O
 * botão, e o fundo do formulario, em Formulário.
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

/**
 * Os fundos do formulario: claros, que quase todo site aceita, e dois escuros. **Os
 * degraus 3 e 12 da paleta**, e nao os 9 do botao: fundo saturado cansa quem le um
 * formulario inteiro, e o texto por cima sai da conta, nao da amostra.
 */
export const FORM_BACKGROUNDS: readonly PaletteColor[] = [
  { name: 'Cinza-claro', value: '#f0f0f3' },
  { name: 'Azul-claro', value: '#e6f4fe' },
  { name: 'Verde-claro', value: '#e9f6e9' },
  { name: 'Amarelo-claro', value: '#fff7c2' },
  { name: 'Pêssego', value: '#ffefd6' },
  { name: 'Rosa-claro', value: '#fee9f5' },
  { name: 'Azul-marinho', value: '#113264' },
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
