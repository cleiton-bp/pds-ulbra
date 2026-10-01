/**
 * As cores que o editor pinta **na imagem**, e so elas.
 *
 * **Nao sao tokens, e nao mudam com o tema.** A seta vermelha sai vermelha no
 * arquivo, e quem abre o relato depois — no painel claro ou escuro — ve a mesma
 * imagem. A interface do editor continua nos tokens; estas cores sao conteudo.
 *
 * Cor nova so entra mudando esta lista, que tem auditoria propria no teste do
 * sistema de cor.
 */

export interface InkColor {
  name: string
  value: string
  /**
   * O contorno do texto e o numero do marcador sobre esta cor: escuro nas claras,
   * claro nas escuras. E o que deixa a marca legivel em cima de qualquer print.
   */
  contrast: string
}

const ESCURO = '#000000'
const CLARO = '#ffffff'

export const INK_COLORS: readonly InkColor[] = [
  { name: 'Vermelho', value: '#e5484d', contrast: CLARO },
  { name: 'Amarelo', value: '#ffc53d', contrast: ESCURO },
  { name: 'Verde', value: '#30a46c', contrast: CLARO },
  { name: 'Azul', value: '#0090ff', contrast: CLARO },
  { name: 'Preto', value: '#1c2024', contrast: CLARO },
  { name: 'Branco', value: CLARO, contrast: ESCURO },
]

/** A tarja de ocultar: preto, sempre. Uma tarja colorida pareceria marca, e nao censura. */
export const HIDE_FILL = ESCURO

/** O que fica fora do recorte, escurecido **so na tela** — nunca no arquivo. */
export const CROP_SHADE = 'rgb(0 0 0 / 0.55)'

/** A borda do recorte, na tela. */
export const CROP_EDGE = CLARO

/** O contraste de uma cor da lista. Cor desconhecida leva contorno escuro. */
export function contrastOf(color: string): string {
  return INK_COLORS.find((cor) => cor.value === color)?.contrast ?? ESCURO
}
