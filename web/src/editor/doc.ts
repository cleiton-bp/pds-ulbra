/**
 * O que a pessoa marcou na imagem, separado da imagem.
 *
 * **As marcas sao uma lista, e nao pixels.** A imagem original fica intacta ate o
 * fim: desfazer e refazer andam na lista, e reabrir o editor traz as marcas de volta,
 * editaveis — tirar a tarja de antes descobre o que estava embaixo, porque o original
 * nunca foi pintado. O arquivo novo so nasce ao concluir, desenhado de uma vez.
 *
 * **Tudo em pixels da imagem, e nao da tela.** A mesma marca cai no mesmo lugar em
 * qualquer tamanho de janela, e o arquivo gerado e o que a pessoa viu.
 */

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Uma marca. As espessuras e tamanhos ja vem em pixels da imagem: sao decididos no
 * gesto, pelo tamanho com que a imagem aparecia — ver `ImageEditor`.
 */
export type Shape =
  | { type: 'arrow'; from: Point; to: Point; color: string; width: number }
  | { type: 'rect'; rect: Rect; color: string; width: number }
  | { type: 'ellipse'; rect: Rect; color: string; width: number }
  | { type: 'pen'; points: Point[]; color: string; width: number }
  | { type: 'highlight'; points: Point[]; color: string; width: number }
  | { type: 'text'; at: Point; text: string; color: string; size: number }
  | { type: 'step'; at: Point; number: number; color: string; radius: number }
  /** `block`: o tamanho do borrao. Quanto maior, menos sobra do que estava embaixo. */
  | { type: 'blur'; rect: Rect; block: number }
  /** A tarja: cobre por inteiro, e o que estava embaixo nao vai no arquivo. */
  | { type: 'hide'; rect: Rect }

export type ShapeType = Shape['type']

export interface EditDoc {
  shapes: Shape[]
  /** O pedaco da imagem que fica. Nulo e a imagem inteira. */
  crop: Rect | null
}

export const EMPTY_DOC: EditDoc = { shapes: [], crop: null }

/** Nada marcado e nada recortado: o arquivo que vale e o original, sem desenhar de novo. */
export function isBlank(doc: EditDoc): boolean {
  return doc.shapes.length === 0 && doc.crop === null
}

/**
 * O que ja foi, o que esta e o que foi desfeito.
 *
 * **Cada passo guarda o documento inteiro, e nao a diferenca.** O documento e uma
 * lista curta de marcas, e as listas sao compartilhadas entre os passos — so a marca
 * nova e memoria nova.
 */
export interface History {
  past: EditDoc[]
  present: EditDoc
  future: EditDoc[]
}

/** Quantos passos desfazer alcanca. Mais que isso e refazer a imagem. */
export const HISTORY_LIMIT = 100

/**
 * O comeco da historia. **Reaberta, as marcas de antes voltam como passos**: desfazer
 * tira uma de cada vez, e e assim que se remove a tarja posta na primeira vez — o
 * editor nao tem borracha. O recorte volta como o primeiro passo.
 */
export function startHistory(doc: EditDoc): History {
  const past: EditDoc[] = []
  let passo = EMPTY_DOC

  if (doc.crop) {
    past.push(passo)
    passo = { ...passo, crop: doc.crop }
  }
  for (const shape of doc.shapes) {
    past.push(passo)
    passo = { ...passo, shapes: [...passo.shapes, shape] }
  }

  // O presente e o proprio `doc`, e nao a copia montada: e pela identidade que o
  // editor sabe se algo mudou desde que abriu.
  return { past: past.slice(-HISTORY_LIMIT), present: doc, future: [] }
}

/** Um passo novo. O que tinha sido desfeito deixa de poder ser refeito. */
export function commit(history: History, doc: EditDoc): History {
  if (doc === history.present) return history
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: doc,
    future: [],
  }
}

export function undo(history: History): History {
  const anterior = history.past.at(-1)
  if (!anterior) return history
  return {
    past: history.past.slice(0, -1),
    present: anterior,
    future: [history.present, ...history.future],
  }
}

export function redo(history: History): History {
  const [proximo, ...resto] = history.future
  if (!proximo) return history
  return { past: [...history.past, history.present], present: proximo, future: resto }
}

/** O retangulo entre dois pontos, arrastando para qualquer lado. */
export function rectBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

/** O ponto dentro da imagem: arrastar para fora dela marca ate a borda. */
export function clampPoint(point: Point, width: number, height: number): Point {
  return {
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height),
  }
}

/**
 * O numero do proximo marcador: um a mais que o maior. Desfeito o ultimo, o
 * seguinte repete o numero dele — e nao pula.
 */
export function nextStepNumber(doc: EditDoc): number {
  let maior = 0
  for (const shape of doc.shapes) if (shape.type === 'step') maior = Math.max(maior, shape.number)
  return maior + 1
}
