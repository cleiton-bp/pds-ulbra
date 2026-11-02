/**
 * O tom de uma coluna: por fazer, fazendo ou feito. Cinza, azul e verde, as cores que o
 * quadro ja da as colunas, escritas por extenso em mapas literais (classe montada por
 * template nao e vista pelo Tailwind nem pelo teste do sistema de cor).
 *
 * Em `shared` porque o quadro de verdade (`StatusLozenge`, em `features/reports`) e a
 * maquete da pagina de entrada falam a mesma lingua de cor.
 */
export type StatusTone = 'todo' | 'doing' | 'done'

/** O ponto do tom, na frente do nome da coluna. */
export const TONE_DOT: Record<StatusTone, string> = {
  todo: 'bg-chip-gray-glyph',
  doing: 'bg-chip-blue-glyph',
  done: 'bg-chip-green-glyph',
}

/** O fundo e a borda do tom: a coluna que recebe o card e a etapa acesa. */
export const TONE_SURFACE: Record<StatusTone, string> = {
  todo: 'border-chip-gray-border bg-chip-gray-surface',
  doing: 'border-chip-blue-border bg-chip-blue-surface',
  done: 'border-chip-green-border bg-chip-green-surface',
}

/** O texto no tom, sempre sobre o fundo do tom. */
export const TONE_FG: Record<StatusTone, string> = {
  todo: 'text-chip-gray-fg',
  doing: 'text-chip-blue-fg',
  done: 'text-chip-green-fg',
}

/** O traco no tom: o anel do passo de agora e a vaga tracejada. */
export const TONE_EDGE: Record<StatusTone, string> = {
  todo: 'border-chip-gray-glyph',
  doing: 'border-chip-blue-glyph',
  done: 'border-chip-green-glyph',
}
