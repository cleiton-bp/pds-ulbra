import type { Entity, Note, Position, Side } from '../types'

/**
 * De que lado cada ponta da linha encosta.
 *
 * Esta escolha nao vai para o arquivo. Se fosse gravada, arrastar uma tabela para o
 * outro lado da tela deixaria a linha saindo pela direita para chegar numa caixa que
 * agora esta a esquerda — dando a volta por fora. Recalcular a cada render custa nada
 * e mantem o desenho legivel sozinho.
 */

// Medidas aproximadas da caixa. Servem so para comparar centros e escolher o lado;
// a altura exata de onde a linha gruda quem resolve e o DOM, porque o ponto de
// conexao e renderizado dentro da propria linha da tabela.
const ENTITY_WIDTH = 230
const ENTITY_HEAD = 34
const FIELD_HEIGHT = 21
const NOTE_LINE_HEIGHT = 19

const centerOfEntity = (entity: Entity): Position => ({
  x: entity.position.x + ENTITY_WIDTH / 2,
  y: entity.position.y + (ENTITY_HEAD + Math.max(1, entity.fields.length) * FIELD_HEIGHT) / 2,
})

const centerOfNote = (note: Note): Position => {
  const lines = Math.max(1, note.text.split('\n').length)
  return {
    x: note.position.x + note.width / 2,
    y: note.position.y + (lines * NOTE_LINE_HEIGHT) / 2,
  }
}

export const boxCenter = (box: Entity | Note): Position =>
  'fields' in box ? centerOfEntity(box) : centerOfNote(box)

/**
 * Escolhe o par de lados que da o caminho mais curto entre dois centros.
 * Horizontal ganha nos empates porque tabela e mais larga que alta — sair pela
 * lateral cruza menos conteudo do que sair por cima.
 */
export function pickSides(
  from: Position,
  to: Position,
  // Ponto preso a uma linha da tabela so tem lateral: uma linha tem 21px de altura,
  // sair por cima dela nao daria para distinguir da linha de baixo.
  horizontalOnly = false,
): { source: Side; target: Side } {
  const dx = to.x - from.x
  const dy = to.y - from.y

  if (horizontalOnly || Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { source: 'right', target: 'left' }
      : { source: 'left', target: 'right' }
  }

  return dy >= 0
    ? { source: 'bottom', target: 'top' }
    : { source: 'top', target: 'bottom' }
}
