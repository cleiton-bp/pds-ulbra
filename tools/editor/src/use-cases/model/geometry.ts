import type { Actor, ActorKind, Note, Position, UseCase } from '../types'

/**
 * Medidas e cruzamentos do desenho.
 *
 * Num diagrama de casos de uso as ligacoes sao retas: apontam de centro a centro e
 * param na borda — do boneco, da elipse, da caixa. O ponto de parada e calculado
 * aqui, e nada disso vai para o arquivo: arrastar um elemento refaz o desenho
 * sozinho.
 */

export type Shape = 'rect' | 'ellipse'

export type Bounds = { x: number; y: number; width: number; height: number }

export type Box = Bounds & { shape: Shape }

/** Altura da elipse. E a mesma para todas, como num diagrama desenhado a mao. */
export const USE_CASE_HEIGHT = 84

/**
 * O tamanho do desenho do ator. No boneco, o no cresce para baixo com o nome, mas
 * nao para os lados — ver `ActorNode`. A linha usa o tamanho medido do no, entao
 * aqui so importa para o boneco e para centralizar um ator novo.
 */
export const ACTOR_SIZE: Record<ActorKind, { width: number; height: number }> = {
  person: { width: 44, height: 72 },
  system: { width: 150, height: 62 },
}

export const useCaseBox = (useCase: UseCase): Box => ({
  ...useCase.position,
  width: useCase.width,
  height: USE_CASE_HEIGHT,
  shape: 'ellipse',
})

export const centerOf = (box: Bounds): Position => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

/**
 * Onde a reta que sai do centro de `box` em direcao a `toward` cruza a borda.
 *
 * Na elipse o raio muda com o angulo, e a conta sai da equacao dela: o ponto
 * `centro + t·(dx, dy)` esta na borda quando (t·dx/a)² + (t·dy/b)² = 1. No
 * retangulo, anda ate bater no primeiro lado.
 */
export function borderPoint(box: Box, toward: Position): Position {
  const center = centerOf(box)
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  if (dx === 0 && dy === 0) return center

  const a = box.width / 2
  const b = box.height / 2

  const t = box.shape === 'ellipse'
    ? 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b))
    : Math.min(dx === 0 ? Infinity : a / Math.abs(dx), dy === 0 ? Infinity : b / Math.abs(dy))

  return { x: center.x + dx * t, y: center.y + dy * t }
}

/** Os dois pontos onde a ligacao entre as caixas comeca e termina. */
export function segment(from: Box, to: Box): { source: Position; target: Position } {
  return {
    source: borderPoint(from, centerOf(to)),
    target: borderPoint(to, centerOf(from)),
  }
}

/** Folga entre a fronteira e as elipses; em cima cabe tambem o nome do sistema. */
export const BOUNDARY_PADDING = 36
export const BOUNDARY_TITLE = 30

/**
 * A fronteira do sistema: o retangulo que envolve todos os casos de uso.
 *
 * Calculada, e nao desenhada a mao: mover uma elipse para fora nunca deixa um
 * caso de uso do lado de fora do sistema por esquecimento. Os atores ficam de
 * fora do calculo — pela UML, eles estao sempre fora da fronteira.
 */
export function systemBounds(useCases: readonly UseCase[]): Bounds | null {
  if (useCases.length === 0) return null
  const boxes = useCases.map(useCaseBox)
  const left = Math.min(...boxes.map((b) => b.x)) - BOUNDARY_PADDING
  const top = Math.min(...boxes.map((b) => b.y)) - BOUNDARY_PADDING - BOUNDARY_TITLE
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + BOUNDARY_PADDING
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + BOUNDARY_PADDING
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * O lugar livre mais perto de onde o elemento novo queria nascer.
 *
 * Sem isto, tres cliques em "+ caso de uso" empilhariam tres elipses no mesmo
 * lugar — e uma elipse nascida em cima de um boneco o esconde por inteiro. Compara
 * caixas, e nao cantos: o boneco e a elipse centrados no mesmo ponto tem cantos
 * diferentes e se cobrem do mesmo jeito.
 *
 * Procura em volta, do mais perto para o mais longe, numa grade de passos de
 * `STEP`. Se nada couber no raio de busca, fica onde queria — melhor em cima de
 * algo do que longe da tela.
 */
export function freeSpot(wanted: Bounds, taken: readonly Bounds[]): Position {
  const GAP = 16
  const STEP = 32
  const RADIUS = 24

  const clear = (x: number, y: number): boolean => taken.every((t) =>
    x + wanted.width + GAP <= t.x || t.x + t.width + GAP <= x
    || y + wanted.height + GAP <= t.y || t.y + t.height + GAP <= y)

  const offsets: Array<{ dx: number; dy: number; distance: number }> = []
  for (let dx = -RADIUS; dx <= RADIUS; dx += 1) {
    for (let dy = -RADIUS; dy <= RADIUS; dy += 1) offsets.push({ dx, dy, distance: dx * dx + dy * dy })
  }
  offsets.sort((a, b) => a.distance - b.distance)

  for (const { dx, dy } of offsets) {
    const x = wanted.x + dx * STEP
    const y = wanted.y + dy * STEP
    if (clear(x, y)) return { x, y }
  }
  return { x: wanted.x, y: wanted.y }
}

/** Altura que o nome ocupa embaixo do boneco, para a conta de espaco livre. */
export const ACTOR_NAME_HEIGHT = 36

/** Altura de uma nota curta. A de verdade depende do texto; aqui basta nao encostar. */
export const NOTE_HEIGHT = 80

/** Largura do nome embaixo do boneco — mais larga que o boneco, e centrada nele. */
export const ACTOR_NAME_WIDTH = 150

type Size = { width: number; height: number }

/**
 * O que ja ocupa lugar no canvas. Para um ator novo, a fronteira do sistema conta
 * como ocupada: pela UML ele nasce do lado de fora.
 *
 * `sizeOf` da a medida de verdade de cada elemento, quando o canvas ja mediu: a
 * nota cresce com o texto e o nome do ator pode quebrar em varias linhas. Sem ela,
 * vale o tamanho de sempre.
 */
export function occupied(
  doc: { actors: readonly Actor[]; useCases: readonly UseCase[]; notes: readonly Note[] },
  { withBoundary = false, sizeOf }: {
    withBoundary?: boolean
    sizeOf?: (kind: 'actor' | 'useCase' | 'note', uid: string) => Size | undefined
  } = {},
): Bounds[] {
  const actors = doc.actors.map((actor) => {
    const size = ACTOR_SIZE[actor.kind]
    const height = sizeOf?.('actor', actor.uid)?.height
      ?? size.height + (actor.kind === 'person' ? ACTOR_NAME_HEIGHT : 0)
    // O nome da pessoa passa da largura do boneco para os dois lados.
    const width = actor.kind === 'person' ? ACTOR_NAME_WIDTH : size.width
    return { x: actor.position.x + size.width / 2 - width / 2, y: actor.position.y, width, height }
  })
  const useCases = doc.useCases.map(useCaseBox)
  const notes = doc.notes.map((note) => ({
    ...note.position,
    width: note.width,
    height: sizeOf?.('note', note.uid)?.height ?? NOTE_HEIGHT,
  }))
  const boundary = withBoundary ? systemBounds(doc.useCases) : null
  return [...actors, ...useCases, ...notes, ...(boundary ? [boundary] : [])]
}
