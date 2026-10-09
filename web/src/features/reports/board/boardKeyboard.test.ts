import type { KeyboardCoordinateGetter } from '@dnd-kit/core'
import { describe, expect, it, vi } from 'vitest'
import { boardKeyboardCoordinates } from '@/features/reports/board/boardKeyboard'
import { type BoardColumn, type BoardItems, cellKey } from '@/features/reports/board/boardState'

/**
 * O QUE ESTES TESTES TRAVAM: para onde as setas levam o card arrastado pelo teclado.
 *
 * O lugar devolvido e um ponto dentro do alvo (a conta de onde o card cai olha a ponta
 * de cima dele): a ponta de cima do card e "antes dele"; a metade de baixo, "depois".
 *
 * - **Para cima e para baixo, o vizinho da mesma coluna** — a partir de onde o card
 *   esta agora (o card sobre o qual ele esta), e nunca um card da coluna ao lado.
 * - **Para os lados, a proxima coluna que recebe card, na altura em que o card esta**,
 *   pulando "Sem coluna" e a aposentada: antes do card dela mais perto dessa altura, ou
 *   depois do ultimo quando o card esta abaixo de todos; a celula vazia e a propria
 *   celula, nunca acima do alto da tela.
 * - **So os cards a vista contam** (Q-01): com a pagina ou a coluna rolada, o topo da
 *   coluna vizinha ficava fora da tela, o card ia para la e voltava sem parar, e a
 *   tela caia. Sem nenhum a vista, o mais perto e rolado ate a vista antes.
 * - **Com raias**, na ponta da celula o card passa a raia vizinha (o comeco da de baixo,
 *   o fim da de cima), pulando a recolhida; para os lados, a mesma raia.
 * - **No fim da linha nao ha para onde ir**, e as outras teclas nao sao com ela.
 */
const coluna = (key: string, accepts = true): BoardColumn => ({
  key,
  name: key,
  accepts,
  retired: !accepts,
  closes: false,
  last: false,
  total: 0,
})

const COLUNAS = [coluna('none', false), coluna('a'), coluna('velha', false), coluna('b')]
const ITENS: BoardItems = { none: ['n1'], a: ['a1', 'a2', 'a3'], velha: [], b: ['b1'] }

const rect = (left: number, top: number, height = 40) => ({
  left,
  top,
  width: 200,
  height,
  right: left + 200,
  bottom: top + height,
})

// Uma coluna por 300px; os cards a cada 50px, a partir de 100.
const RECTS = new Map<string, ReturnType<typeof rect>>([
  ['none', rect(0, 90, 400)],
  ['a', rect(300, 90, 400)],
  ['velha', rect(600, 90, 400)],
  ['b', rect(900, 90, 400)],
  ['n1', rect(0, 100)],
  ['a1', rect(300, 100)],
  ['a2', rect(300, 150)],
  ['a3', rect(300, 200)],
  ['b1', rect(900, 100)],
])

function setas(): KeyboardCoordinateGetter {
  return boardKeyboardCoordinates({ current: COLUNAS }, { current: ITENS })
}

// O retangulo do card na mao e o do proprio card: as setas partem de onde ele esta.
function tecla(code: string, ativo: string, sobre: string | null = ativo) {
  const evento = { code, preventDefault: vi.fn() } as unknown as KeyboardEvent
  const contexto = {
    active: { id: ativo },
    over: sobre ? { id: sobre } : null,
    collisionRect: RECTS.get(ativo) ?? rect(0, 0),
    droppableRects: RECTS,
  }
  const resultado = setas()(evento, {
    active: ativo,
    currentCoordinates: { x: 0, y: 0 },
    context: contexto,
  } as never)
  return { resultado, evento }
}

describe('as setas no quadro', () => {
  it('para baixo e para cima: o vizinho na mesma coluna, a partir de onde o card esta agora', () => {
    // Descendo, a borda de baixo encosta na do vizinho.
    expect(tecla('ArrowDown', 'a1').resultado).toEqual({ x: 300, y: 150 + 40 - 40 })
    // Ja sobre a2, a proxima descida vai ate a3.
    expect(tecla('ArrowDown', 'a1', 'a2').resultado).toEqual({ x: 300, y: 200 })
    expect(tecla('ArrowUp', 'a3').resultado).toEqual({ x: 300, y: 150 })
    // No fundo, nao ha para onde descer — nem para um card da coluna ao lado.
    expect(tecla('ArrowDown', 'a3').resultado).toBeUndefined()
  })

  it('para os lados: a proxima coluna que recebe card, na altura do card, pulando a aposentada e "Sem coluna"', () => {
    // a2 esta abaixo do unico card de b: depois dele (a metade de baixo).
    expect(tecla('ArrowRight', 'a2').resultado).toEqual({ x: 900, y: 100 + 40 / 2 + 1 })
    // b1 esta na altura de a1: antes dele.
    expect(tecla('ArrowLeft', 'b1').resultado).toEqual({ x: 300, y: 100 })
    expect(tecla('ArrowLeft', 'a1').resultado).toBeUndefined()
    // De "Sem coluna", a direita e a primeira que recebe.
    expect(tecla('ArrowRight', 'n1').resultado).toEqual({ x: 300, y: 100 })
  })

  it('as outras teclas nao sao com ela, e as setas nao rolam a pagina', () => {
    const { resultado, evento } = tecla('Enter', 'a1')
    expect(resultado).toBeUndefined()
    expect(evento.preventDefault).not.toHaveBeenCalled()
    expect(tecla('ArrowDown', 'a1').evento.preventDefault).toHaveBeenCalled()
  })
})

describe('as setas no quadro com raias', () => {
  // Duas colunas (a, b) e tres raias (r1, r2, r3); a celula b/r2 vazia, e a raia r2
  // recolhida em "a" (sem caixa na tela).
  const A1 = cellKey('a', 'r1')
  const A3 = cellKey('a', 'r3')
  const B1 = cellKey('b', 'r1')
  const B2 = cellKey('b', 'r2')
  const B3 = cellKey('b', 'r3')
  const itens: BoardItems = { [A1]: ['p', 'q'], [A3]: ['z'], [B1]: ['w'], [B2]: [], [B3]: [] }
  const caixas = new Map<string, ReturnType<typeof rect>>([
    [A1, rect(300, 90, 120)],
    [A3, rect(300, 400, 80)],
    [B1, rect(600, 90, 80)],
    [B2, rect(600, 250, 60)],
    [B3, rect(600, 400, 60)],
    ['p', rect(300, 100)],
    ['q', rect(300, 150, 60)],
    ['z', rect(300, 410)],
    ['w', rect(600, 100)],
  ])
  const getter = boardKeyboardCoordinates(
    { current: [coluna('a'), coluna('b')] },
    { current: itens },
    { current: ['r1', 'r2', 'r3'] },
  )
  const seta = (code: string, ativo: string, sobre: string | null = ativo) =>
    getter(
      { code, preventDefault: vi.fn() } as unknown as KeyboardEvent,
      {
        active: ativo,
        currentCoordinates: { x: 0, y: 0 },
        context: {
          active: { id: ativo },
          over: sobre ? { id: sobre } : null,
          collisionRect: rect(0, 0),
          droppableRects: caixas,
        },
      } as never,
    )

  it('na ponta da celula, para baixo vai ao comeco da raia de baixo — pulando a recolhida', () => {
    expect(seta('ArrowDown', 'q')).toEqual({ x: 300, y: 410 })
    // Na raia de baixo vazia (b/r2), a propria celula.
    expect(seta('ArrowDown', 'w')).toEqual({ x: 600, y: 250 })
  })

  it('para cima vai ao fim da raia de cima; na primeira raia, nao ha para onde subir', () => {
    // O fim de a/r1 e q: o ponto na metade de baixo dele poe o card depois de q.
    expect(seta('ArrowUp', 'z')).toEqual({ x: 300, y: 150 + 60 / 2 + 1 })
    expect(seta('ArrowUp', 'p')).toBeUndefined()
  })

  it('para os lados, a mesma raia da proxima coluna', () => {
    // b/r3 esta vazia: a propria celula.
    expect(seta('ArrowRight', 'z')).toEqual({ x: 600, y: 400 })
    // De w (b/r1), o card de a/r1 na altura dele: p.
    expect(seta('ArrowLeft', 'w')).toEqual({ x: 300, y: 100 })
  })
})

describe('para os lados, na altura do card (Q-01)', () => {
  // Tres colunas: x na primeira, quatro cards em b (de 50 em 50 a partir de 100) e c vazia.
  const colunas = [coluna('a'), coluna('b'), coluna('c')]
  const itens: BoardItems = { a: ['x'], b: ['b1', 'b2', 'b3', 'b4'], c: [] }
  const caixas = (topoDeC = 90) =>
    new Map<string, ReturnType<typeof rect>>([
      ['a', rect(0, 90, 600)],
      ['b', rect(300, 90, 600)],
      ['c', rect(600, topoDeC, 600)],
      ['b1', rect(300, 100)],
      ['b2', rect(300, 150)],
      ['b3', rect(300, 200)],
      ['b4', rect(300, 250)],
    ])

  /** Um alvo do arraste cuja janela que rola mostra so a faixa de `topo` a `fundo`. */
  const naJanela = (topo: number, fundo: number) => {
    const scrollIntoView = vi.fn()
    const area = { top: topo, bottom: fundo }
    return {
      scrollIntoView,
      alvo: {
        node: {
          current: { closest: () => ({ getBoundingClientRect: () => area }), scrollIntoView },
        },
      },
    }
  }

  function lado(
    code: string,
    ativo: string,
    topo: number,
    opcoes: { rects?: Map<string, ReturnType<typeof rect>>; alvos?: Map<string, unknown> } = {},
  ) {
    const getter = boardKeyboardCoordinates({ current: colunas }, { current: itens })
    return getter(
      { code, preventDefault: vi.fn() } as unknown as KeyboardEvent,
      {
        active: ativo,
        currentCoordinates: { x: 0, y: 0 },
        context: {
          active: { id: ativo },
          over: { id: ativo },
          collisionRect: rect(ativo === 'x' ? 0 : 300, topo),
          droppableRects: opcoes.rects ?? caixas(),
          droppableContainers: opcoes.alvos,
        },
      } as never,
    )
  }

  it('antes do card vizinho mais perto da altura; abaixo de todos, depois do ultimo', () => {
    // Dentro de b2: antes dele.
    expect(lado('ArrowRight', 'x', 160)).toEqual({ x: 300, y: 150 })
    // No vao entre b2 (ate 190) e b3 (de 200), mais perto de b3: antes de b3.
    expect(lado('ArrowRight', 'x', 195)).toEqual({ x: 300, y: 200 })
    // Na metade de cima de b4: antes dele; na de baixo, depois.
    expect(lado('ArrowRight', 'x', 255)).toEqual({ x: 300, y: 250 })
    expect(lado('ArrowRight', 'x', 275)).toEqual({ x: 300, y: 250 + 40 / 2 + 1 })
    // Bem abaixo de todos: depois do ultimo, e nao o topo da coluna.
    expect(lado('ArrowRight', 'x', 520)).toEqual({ x: 300, y: 250 + 40 / 2 + 1 })
  })

  it('a celula vazia e a propria celula — com a pagina rolada, no alto da tela, e nao acima dela', () => {
    expect(lado('ArrowRight', 'b2', 150)).toEqual({ x: 600, y: 90 })
    // O topo de c passou do alto da tela: a mira fica na tela.
    expect(lado('ArrowRight', 'b2', 150, { rects: caixas(-400) })).toEqual({ x: 600, y: 0 })
  })

  it('so os cards a vista contam: o card rolado para fora da coluna nao e o alvo', () => {
    // A lista de b rolou: b1 e b2 sairam por cima (a vista, so de 195 para baixo).
    const janela = naJanela(195, 700)
    const alvos = new Map(['b1', 'b2', 'b3', 'b4'].map((id) => [id, janela.alvo]))
    // x na altura de b1, que nao se ve: o mais perto a vista e b3.
    expect(lado('ArrowRight', 'x', 105, { alvos })).toEqual({ x: 300, y: 200 })
    expect(janela.scrollIntoView).not.toHaveBeenCalled()
  })

  it('nenhum a vista: o mais perto da altura vem para a vista, e e o alvo', () => {
    const janela = naJanela(1000, 1400)
    const alvos = new Map(['b1', 'b2', 'b3', 'b4'].map((id) => [id, janela.alvo]))
    expect(lado('ArrowRight', 'x', 160, { alvos })).toEqual({ x: 300, y: 150 })
    expect(janela.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('com a pagina rolada, a coluna vizinha comeca acima da tela: a mira fica na altura do card, e repetida da o mesmo lugar', () => {
    // b com vinte cards de -490 a 460; a pagina rolou e o topo de b esta em -500.
    const muitos = Array.from({ length: 20 }, (_, i) => `m${i}`)
    const rects = new Map<string, ReturnType<typeof rect>>([
      ['a', rect(0, -500, 1000)],
      ['b', rect(300, -500, 1000)],
      ['c', rect(600, -500, 1000)],
      ...muitos.map((id, i): [string, ReturnType<typeof rect>] => [id, rect(300, -490 + 50 * i)]),
    ])
    const getter = boardKeyboardCoordinates(
      { current: colunas },
      { current: { a: ['x'], b: muitos, c: [] } },
    )
    const tela = naJanela(0, 800)
    const alvos = new Map(muitos.map((id) => [id, tela.alvo]))
    const apertar = () =>
      getter(
        { code: 'ArrowRight', preventDefault: vi.fn() } as unknown as KeyboardEvent,
        {
          active: 'x',
          currentCoordinates: { x: 0, y: 0 },
          context: {
            active: { id: 'x' },
            over: { id: 'x' },
            collisionRect: rect(0, 300),
            droppableRects: rects,
            droppableContainers: alvos,
          },
        } as never,
      )
    const primeira = apertar()
    // O card de 260 a 300 e o mais perto da altura 301: antes dele — dentro da tela.
    expect(primeira).toEqual({ x: 300, y: 260 })
    // A mesma conta da o mesmo lugar: nada de ir e voltar entre duas miras.
    expect(apertar()).toEqual(primeira)
  })
})
