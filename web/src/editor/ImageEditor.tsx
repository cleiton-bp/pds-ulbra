import * as Dialog from '@radix-ui/react-dialog'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  clampPoint,
  commit,
  type EditDoc,
  EMPTY_DOC,
  isBlank,
  nextStepNumber,
  type Point,
  type Rect,
  rectBetween,
  redo,
  type Shape,
  startHistory,
  undo,
} from '@/editor/doc'
import { EditorIcon, type Tool } from '@/editor/icons'
import { exportEdit, type OpenedImage, openImage } from '@/editor/image'
import { INK_COLORS } from '@/editor/palette'
import { drawScene, hideMarginFor } from '@/editor/render'
import { cn } from '@/shared/lib/cn'
import { formatBytes } from '@/shared/lib/formatBytes'

/**
 * O EDITOR DA IMAGEM — marcar o print antes de ele entrar no relato.
 *
 * **E por aqui que a pessoa esconde o que nao quer mostrar.** A captura nao esconde
 * nada sozinha: nenhuma regra acerta o que e senha, cartao ou dado pessoal em todo
 * site, e errar para menos daria confianca falsa. Ocultar cobre com uma tarja, e o
 * arquivo que sobe e desenhado de novo — o que estava embaixo nao vai.
 *
 * **O original nao muda.** As marcas sao uma lista a parte (`EditDoc`), e o arquivo
 * novo so nasce ao concluir. Sem marca nenhuma, o arquivo que vale e o proprio
 * original, sem passar pelo canvas.
 *
 * Abre em cima de tudo, e prende o foco: sem isso, o Tab andaria pelo formulario
 * escondido atras.
 */

export type { Tool }

export interface EditResult {
  file: File
  /** As marcas que geraram o arquivo. Nulo: nada marcado, e `file` e o original. */
  doc: EditDoc | null
}

export interface ImageEditorProps {
  /** A imagem sem marcas. */
  source: File
  /** As marcas de antes, para continuarem editaveis. */
  initial: EditDoc | null
  /**
   * `add`: uma imagem que ainda nao esta na lista — a captura —, e so entra se a pessoa
   * adicionar. `save`: uma que ja esta, e cancelar a deixa como estava.
   */
  mode: 'add' | 'save'
  /** O teto de imagem do projeto: o arquivo gerado precisa caber nele. */
  maxBytes: number | null
  /** As cores do cliente, no quadro. Fora dele, valem as do produto. */
  accent?: CSSProperties
  onDone: (result: EditResult) => void
  onCancel: () => void
}

/**
 * As ferramentas, em tres grupos na barra de baixo: marcar, esconder e recortar. Cada
 * uma com a letra do atalho, que aparece ao passar o mouse.
 */
const TOOLS: {
  tool: Tool
  label: string
  /** O nome embaixo do icone, na faixa do celular, onde nao ha dica de passar o mouse. */
  curto: string
  tecla: string
  grupo: 'marcar' | 'esconder' | 'recortar'
}[] = [
  { tool: 'arrow', label: 'Seta', curto: 'Seta', tecla: 'A', grupo: 'marcar' },
  { tool: 'rect', label: 'Retângulo', curto: 'Retângulo', tecla: 'R', grupo: 'marcar' },
  { tool: 'ellipse', label: 'Elipse', curto: 'Elipse', tecla: 'E', grupo: 'marcar' },
  { tool: 'pen', label: 'Desenho livre', curto: 'Livre', tecla: 'D', grupo: 'marcar' },
  { tool: 'highlight', label: 'Marca-texto', curto: 'Marca-texto', tecla: 'M', grupo: 'marcar' },
  { tool: 'step', label: 'Numeração', curto: 'Numeração', tecla: 'N', grupo: 'marcar' },
  { tool: 'blur', label: 'Desfoque', curto: 'Desfoque', tecla: 'B', grupo: 'esconder' },
  { tool: 'hide', label: 'Ocultar', curto: 'Ocultar', tecla: 'O', grupo: 'esconder' },
  { tool: 'crop', label: 'Recortar', curto: 'Recortar', tecla: 'C', grupo: 'recortar' },
]

/** Os grupos da barra, na ordem. No celular eles se dividem em duas linhas, sem partir um grupo. */
const GRUPOS = ['marcar', 'esconder', 'recortar'] as const

/** As ferramentas que pintam com a cor escolhida. Desfoque, tarja e recorte nao tem cor. */
const COM_COR: ReadonlySet<Tool> = new Set(['arrow', 'rect', 'ellipse', 'pen', 'highlight', 'step'])

/**
 * Os tamanhos, em pixels **da tela**. Viram pixels da imagem no gesto, pelo tamanho
 * com que ela aparece: a marca sai do tamanho que a pessoa viu ao desenhar, num
 * print de celular ou de monitor grande.
 */
const SIZE = { stroke: 3, highlight: 18, stepRadius: 13, blurBlock: 14 }

/** Arrastar menos que isto, em pixels da tela, e um clique — e nao marca nada. */
export const MIN_DRAG = 4

/** O menor recorte, em pixels da tela. */
export const MIN_CROP = 8

/** A folga em volta da imagem no palco (o `p-4` dele). */
const FOLGA = 16

/**
 * **Ampliar a imagem**, ate 3 pixels da tela por pixel dela. No celular, um print de
 * computador aparecia com uns 28% do tamanho, e cobrir uma senha ou marcar um botao era
 * acertar um alvo de poucos pixels. Pinçar com dois dedos amplia e move; os botoes, o
 * Ctrl (ou Cmd) com a roda e as teclas + - 0 fazem o mesmo.
 */
const ZOOM_MAXIMO_DA_IMAGEM = 3

/** Quanto cada clique em ampliar ou diminuir muda. */
const PASSO_DO_ZOOM = 1.5

const HINTS: Partial<Record<Tool, string>> = {
  step: 'Cada clique põe o próximo número.',
  blur: 'Borra o que fica embaixo. Para senha ou cartão, use Ocultar.',
  hide: 'Cobre com uma tarja preta: o que fica embaixo não vai na imagem.',
  crop: 'Arraste para escolher o pedaço que fica.',
}

/** O lembrete de sempre: a captura nao esconde nada, e e aqui que se esconde. */
const DEFAULT_HINT = 'Para esconder senha, cartão ou dado pessoal, use Ocultar.'

/**
 * As ferramentas de caixa, que tambem se usam **pelo teclado**: com o foco na imagem,
 * Enter poe uma caixa no meio, as setas a movem, Shift e as setas mudam o tamanho, e
 * Enter confirma. Sem isto, quem nao usa ponteiro nao teria como esconder nada.
 */
const CAIXA: ReadonlySet<Tool> = new Set(['rect', 'ellipse', 'blur', 'hide', 'crop'])

/** Quanto a caixa anda por tecla, em pixels da tela. */
const PASSO_DA_CAIXA = 10

const CAIXA_HINT =
  'Setas movem a caixa; Shift e setas mudam o tamanho; Enter confirma; Esc desiste.'

interface Gesto {
  pointerId: number
  inicio: Point
  fim: Point
  pontos: Point[]
}

export function ImageEditor({
  source,
  initial,
  mode,
  maxBytes,
  accent,
  onDone,
  onCancel,
}: ImageEditorProps) {
  /** O documento com que o editor abriu. Voltar a ele por desfazer e nao ter mudado nada. */
  const [inicial] = useState(() => initial ?? EMPTY_DOC)
  const [historia, setHistoria] = useState(() => startHistory(inicial))
  const [aberta, setAberta] = useState<OpenedImage | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [ferramenta, setFerramenta] = useState<Tool>('arrow')
  const [cor, setCor] = useState(INK_COLORS[0]?.value ?? '')
  const [confirmando, setConfirmando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [palco, setPalco] = useState({ width: 0, height: 0 })
  /** Quanto a imagem esta ampliada alem de caber no palco: 1 e caber. */
  const [zoom, setZoom] = useState(1)

  /**
   * O palco, em estado e nao em ref: o conteudo do dialogo entra na pagina um desenho
   * depois do editor, e so entao da para medir. Com ref, a medida rodava antes de o
   * palco existir e nunca mais — e a imagem aparecia do tamanho dela, maior que a tela.
   */
  const [palcoEl, setPalcoEl] = useState<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const voltar = useRef<HTMLButtonElement>(null)
  /** A primeira ferramenta: e onde o foco comeca, e nao no "Descartar" do topo. */
  const primeiraFerramenta = useRef<HTMLButtonElement>(null)
  const pilula = usePilula(ferramenta)
  const celular = useCelular()

  /** O gesto em andamento, e o que ele desenha antes de soltar. Fora do estado: muda a cada movimento. */
  const gesto = useRef<Gesto | null>(null)
  const rascunho = useRef<Shape | null>(null)
  const recorteRascunho = useRef<Rect | null>(null)
  const quadro = useRef<number | null>(null)

  /** A caixa do teclado, em pixels da imagem. Ver `CAIXA`. */
  const caixa = useRef<Rect | null>(null)
  const [caixaAtiva, setCaixaAtiva] = useState(false)

  /** A moldura do canvas: e ela que a pinça estica ao vivo, antes de o zoom valer. */
  const moldura = useRef<HTMLDivElement>(null)
  /** Os dedos no palco agora, para a pinça. */
  const toques = useRef(new Map<number, { x: number; y: number }>())
  /** A pinça em andamento: de onde partiu e onde esta. Ver `tocarNoPalco`. */
  const pinca = useRef<{
    distancia: number
    centro: { x: number; y: number }
    zoom: number
    ponto: Point
    origem: { x: number; y: number }
    fator: number
    agora: { x: number; y: number }
  } | null>(null)
  /** Depois de uma pinça, o dedo que sobrou nao desenha ate todos saírem da tela. */
  const esperarSoltar = useRef(false)
  /** O ultimo numero foi posto por um toque: se virar pinça, ele sai. */
  const numeroDoToque = useRef(false)
  /** O ponto da imagem que fica parado sob o dedo (ou o centro) quando o zoom muda. */
  const ancora = useRef<{ ponto: Point; cliente: { x: number; y: number } } | null>(null)

  const idAjuda = useId()
  const idPergunta = useId()

  // Sem medida — o ambiente de teste nao mede nada —, a imagem aparece do tamanho dela.
  /** A escala em que a imagem inteira cabe no palco. */
  const ajuste =
    aberta && palco.width > FOLGA * 2 && palco.height > FOLGA * 2
      ? Math.min(
          1,
          (palco.width - FOLGA * 2) / aberta.width,
          (palco.height - FOLGA * 2) / aberta.height,
        )
      : 1
  const zoomMaximo = Math.max(1, ZOOM_MAXIMO_DA_IMAGEM / ajuste)
  const zoomAgora = Math.min(zoom, zoomMaximo)
  const escala = ajuste * zoomAgora
  const densidade = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2)
  const larguraCss = aberta ? Math.max(1, Math.round(aberta.width * escala)) : 0
  const alturaCss = aberta ? Math.max(1, Math.round(aberta.height * escala)) : 0

  /** O que o desenho fora do React le: o quadro seguinte nao pode ver valores velhos. */
  const atual = useRef({ historia, escala, ajuste, densidade, aberta })
  atual.current = { historia, escala, ajuste, densidade, aberta }

  /**
   * Muda o zoom mantendo parado o ponto da imagem sob `cliente` (o dedo, o ponteiro) ou o
   * centro do palco. A rolagem que mantem o ponto e acertada depois do desenho novo.
   */
  function ampliarPara(novo: number, cliente?: { x: number; y: number }) {
    const alvo = Math.min(Math.max(novo, 1), zoomMaximo)
    if (Math.abs(alvo - zoomAgora) < 0.001) return
    const tela = canvasRef.current
    if (palcoEl && tela) {
      const caixaDoPalco = palcoEl.getBoundingClientRect()
      const c = cliente ?? {
        x: caixaDoPalco.left + caixaDoPalco.width / 2,
        y: caixaDoPalco.top + caixaDoPalco.height / 2,
      }
      const caixaDaTela = tela.getBoundingClientRect()
      ancora.current = {
        ponto: { x: (c.x - caixaDaTela.left) / escala, y: (c.y - caixaDaTela.top) / escala },
        cliente: c,
      }
    }
    setZoom(alvo)
  }
  const ampliar = useRef(ampliarPara)
  ampliar.current = ampliarPara

  // biome-ignore lint/correctness/useExhaustiveDependencies: a escala nova e o gatilho de acertar a rolagem
  useLayoutEffect(() => {
    const alvo = ancora.current
    const tela = canvasRef.current
    if (!alvo || !palcoEl || !tela) return
    ancora.current = null
    const caixaDaTela = tela.getBoundingClientRect()
    palcoEl.scrollLeft += caixaDaTela.left + alvo.ponto.x * escala - alvo.cliente.x
    palcoEl.scrollTop += caixaDaTela.top + alvo.ponto.y * escala - alvo.cliente.y
  }, [escala])

  // Ctrl (ou Cmd) com a roda amplia, e a pinça do trackpad chega assim tambem. Passivo nao:
  // sem o `preventDefault`, o navegador ampliaria a pagina inteira junto.
  useEffect(() => {
    if (!palcoEl) return
    const roda = (evento: WheelEvent) => {
      if (!evento.ctrlKey && !evento.metaKey) return
      evento.preventDefault()
      const { escala: e, ajuste: a } = atual.current
      ampliar.current((e / a) * Math.exp(-evento.deltaY * 0.01), {
        x: evento.clientX,
        y: evento.clientY,
      })
    }
    palcoEl.addEventListener('wheel', roda, { passive: false })
    return () => palcoEl.removeEventListener('wheel', roda)
  }, [palcoEl])

  const centroDosToques = () => {
    const [a, b] = [...toques.current.values()]
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 }
  }
  const distanciaDosToques = () => {
    const [a, b] = [...toques.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  /**
   * **A pinça.** O segundo dedo no palco desfaz o que o primeiro comecava (a marca em
   * andamento, ou o numero que ele pos) e passa a ampliar e mover. Enquanto os dedos
   * andam, so a moldura estica, por `transform` (o canvas nao e redesenhado a cada
   * quadro); ao soltar, o zoom vale e a imagem e desenhada de novo, nitida.
   */
  function tocarNoPalco(evento: PointerEvent<HTMLDivElement>) {
    if (evento.pointerType !== 'touch' || !aberta || gerando || confirmando) return
    toques.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY })
    if (toques.current.size > 2) {
      evento.stopPropagation()
      return
    }
    if (toques.current.size !== 2) return
    // O canvas nao ve o segundo dedo: ele nao comeca outra marca.
    evento.stopPropagation()
    gesto.current = null
    rascunho.current = null
    recorteRascunho.current = null
    if (numeroDoToque.current) setHistoria(undo)
    numeroDoToque.current = false
    agendar()
    const tela = canvasRef.current
    if (!tela) return
    const caixaDaTela = tela.getBoundingClientRect()
    const centro = centroDosToques()
    pinca.current = {
      distancia: Math.max(1, distanciaDosToques()),
      centro,
      zoom: zoomAgora,
      ponto: {
        x: (centro.x - caixaDaTela.left) / escala,
        y: (centro.y - caixaDaTela.top) / escala,
      },
      origem: { x: centro.x - caixaDaTela.left, y: centro.y - caixaDaTela.top },
      fator: 1,
      agora: centro,
    }
    esperarSoltar.current = true
  }

  function moverNoPalco(evento: PointerEvent<HTMLDivElement>) {
    if (!toques.current.has(evento.pointerId)) return
    toques.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY })
    const p = pinca.current
    const elemento = moldura.current
    if (!p || toques.current.size < 2 || !elemento) return
    // O fator ja respeita o zoom de 1 a maximo: esticar alem disso voltaria ao soltar.
    p.fator = Math.min(
      Math.max(distanciaDosToques() / p.distancia, 1 / p.zoom),
      zoomMaximo / p.zoom,
    )
    p.agora = centroDosToques()
    elemento.style.transformOrigin = `${p.origem.x}px ${p.origem.y}px`
    elemento.style.transform = `translate(${p.agora.x - p.centro.x}px, ${p.agora.y - p.centro.y}px) scale(${p.fator})`
  }

  function soltarDoPalco(evento: PointerEvent<HTMLDivElement>) {
    if (!toques.current.delete(evento.pointerId)) return
    const p = pinca.current
    if (p && toques.current.size < 2) {
      pinca.current = null
      const elemento = moldura.current
      if (elemento) {
        elemento.style.transform = ''
        elemento.style.transformOrigin = ''
      }
      const alvo = Math.min(Math.max(p.zoom * p.fator, 1), zoomMaximo)
      if (Math.abs(alvo - zoomAgora) < 0.001) {
        // So moveu, sem ampliar: a rolagem leva junto.
        if (palcoEl) {
          palcoEl.scrollLeft -= p.agora.x - p.centro.x
          palcoEl.scrollTop -= p.agora.y - p.centro.y
        }
      } else {
        ancora.current = { ponto: p.ponto, cliente: p.agora }
        setZoom(alvo)
      }
    }
    if (toques.current.size === 0) esperarSoltar.current = false
  }

  // Abre a imagem, e devolve a memoria dela ao fechar.
  useEffect(() => {
    let viva = true
    let abertaAqui: OpenedImage | null = null

    openImage(source)
      .then((imagem) => {
        if (!viva || !imagem.width || !imagem.height) {
          imagem.close()
          if (viva) setFalhou(true)
          return
        }
        abertaAqui = imagem
        setAberta(imagem)
      })
      .catch(() => {
        if (viva) setFalhou(true)
      })

    return () => {
      viva = false
      abertaAqui?.close()
    }
  }, [source])

  // O palco muda com a janela — girar o telefone basta.
  useLayoutEffect(() => {
    const elemento = palcoEl
    if (!elemento) return

    const medir = () => setPalco({ width: elemento.clientWidth, height: elemento.clientHeight })
    medir()

    if (typeof ResizeObserver === 'function') {
      const observador = new ResizeObserver(medir)
      observador.observe(elemento)
      return () => observador.disconnect()
    }
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [palcoEl])

  function desenhar() {
    const { historia: agora, escala: e, densidade: d, aberta: imagem } = atual.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !imagem) return

    drawScene(
      ctx,
      imagem.image,
      agora.present,
      { scale: e * d, origin: { x: 0, y: 0 } },
      {
        draft: rascunho.current,
        cropGuide: recorteRascunho.current ?? agora.present.crop,
        // A folga do arquivo, e nao a da tela: ver `hideMarginFor`.
        hideMargin: hideMarginFor(agora.present, imagem),
      },
    )
  }

  /** Um desenho por quadro da tela, por mais que o ponteiro se mexa. */
  function agendar() {
    if (quadro.current !== null) return
    const proximo =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16)
    quadro.current = proximo(() => {
      quadro.current = null
      desenhar()
    })
  }

  // Redesenha quando as marcas ou o tamanho mudam. Mudar o tamanho do canvas o apaga.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `desenhar` le tudo por `atual`.
  useEffect(() => {
    desenhar()
  }, [historia.present, larguraCss, alturaCss, densidade, aberta])

  useEffect(
    () => () => {
      if (quadro.current !== null && typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(quadro.current)
    },
    [],
  )

  // Na faixa do celular, a ferramenta escolhida (pelo toque ou pela letra) fica a vista.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a ferramenta e o gatilho
  useEffect(() => {
    if (!celular) return
    pilula.lista.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [ferramenta, celular])

  // Perguntar antes de descartar comeca no "Voltar": Enter por engano nao apaga as marcas.
  useEffect(() => {
    if (confirmando) voltar.current?.focus()
  }, [confirmando])

  function aplicar(proximo: (doc: EditDoc) => EditDoc) {
    setHistoria((agora) => commit(agora, proximo(agora.present)))
  }

  function adicionarMarca(shape: Shape) {
    aplicar((doc) => ({ ...doc, shapes: [...doc.shapes, shape] }))
  }

  /** Pixels da imagem por pixel da tela, agora. */
  function unidade() {
    return 1 / atual.current.escala
  }

  /**
   * A unidade do tamanho das marcas: a da imagem inteira na tela, **sem o zoom**. Ampliada,
   * uma seta de 3 pixels sairia com um quarto da grossura, e as marcas de um mesmo print
   * teriam tamanhos diferentes conforme o zoom de quando foram feitas.
   */
  function unidadeDaMarca() {
    return 1 / atual.current.ajuste
  }

  function pontoDo(evento: { clientX: number; clientY: number; currentTarget: Element }): Point {
    const limites = evento.currentTarget.getBoundingClientRect()
    const { escala: e, aberta: imagem } = atual.current
    return clampPoint(
      { x: (evento.clientX - limites.left) / e, y: (evento.clientY - limites.top) / e },
      imagem?.width ?? 0,
      imagem?.height ?? 0,
    )
  }

  /** A marca de uma ferramenta de caixa, no retangulo dado. O recorte nao e marca. */
  function marcaDoRetangulo(rect: Rect): Shape | null {
    const u = unidadeDaMarca()
    switch (ferramenta) {
      case 'rect':
      case 'ellipse':
        return { type: ferramenta, rect, color: cor, width: SIZE.stroke * u }
      case 'blur':
        return { type: 'blur', rect, block: SIZE.blurBlock * u }
      case 'hide':
        return { type: 'hide', rect }
      default:
        return null
    }
  }

  function marcaDoGesto(g: Gesto): Shape | null {
    const u = unidadeDaMarca()
    switch (ferramenta) {
      case 'arrow':
        return { type: 'arrow', from: g.inicio, to: g.fim, color: cor, width: SIZE.stroke * u }
      case 'pen':
        return { type: 'pen', points: [...g.pontos], color: cor, width: SIZE.stroke * u }
      case 'highlight':
        return { type: 'highlight', points: [...g.pontos], color: cor, width: SIZE.highlight * u }
      default:
        return marcaDoRetangulo(rectBetween(g.inicio, g.fim))
    }
  }

  function mover(ponto: Point) {
    const g = gesto.current
    if (!g) return

    g.fim = ponto
    if (ferramenta === 'pen' || ferramenta === 'highlight') {
      const ultimo = g.pontos.at(-1)
      if (!ultimo || Math.hypot(ponto.x - ultimo.x, ponto.y - ultimo.y) >= unidade())
        g.pontos.push(ponto)
    }

    if (ferramenta === 'crop') recorteRascunho.current = rectBetween(g.inicio, g.fim)
    else rascunho.current = marcaDoGesto(g)
    agendar()
  }

  function apertar(evento: PointerEvent<HTMLCanvasElement>) {
    if (!aberta || gerando || confirmando) return
    if (evento.pointerType === 'mouse' && evento.button !== 0) return
    // Um dedo desenhando; o segundo nao comeca outra marca por cima (ele e da pinça).
    if (gesto.current || esperarSoltar.current) return

    // O ponteiro toma o lugar da caixa do teclado.
    if (caixa.current) desistirDaCaixa()

    const ponto = pontoDo(evento)

    if (ferramenta === 'step') {
      // No toque, o numero pode ser o primeiro dedo de uma pinça: se o segundo vier, ele sai.
      numeroDoToque.current = evento.pointerType === 'touch'
      adicionarMarca({
        type: 'step',
        at: ponto,
        number: nextStepNumber(atual.current.historia.present),
        color: cor,
        radius: SIZE.stepRadius * unidadeDaMarca(),
      })
      return
    }

    evento.currentTarget.setPointerCapture?.(evento.pointerId)
    gesto.current = { pointerId: evento.pointerId, inicio: ponto, fim: ponto, pontos: [ponto] }
    mover(ponto)
  }

  /** Mostra a caixa do teclado como a marca que ela vai virar. */
  function mostrarCaixa() {
    const atualCaixa = caixa.current
    if (ferramenta === 'crop') recorteRascunho.current = atualCaixa
    else rascunho.current = atualCaixa ? marcaDoRetangulo(atualCaixa) : null
    agendar()
  }

  function desistirDaCaixa() {
    caixa.current = null
    rascunho.current = null
    recorteRascunho.current = null
    setCaixaAtiva(false)
    agendar()
  }

  function confirmarCaixa() {
    const rect = caixa.current
    desistirDaCaixa()
    if (!rect) return
    if (ferramenta === 'crop') {
      aplicar((doc) => ({ ...doc, crop: rect }))
      return
    }
    const marca = marcaDoRetangulo(rect)
    if (marca) adicionarMarca(marca)
  }

  /** A caixa pelo teclado. Ver `CAIXA`. */
  function teclado(evento: KeyboardEvent<HTMLCanvasElement>) {
    if (!aberta || gerando || confirmando || !CAIXA.has(ferramenta)) return

    const atualCaixa = caixa.current
    const confirma = evento.key === 'Enter' || evento.key === ' '

    if (!atualCaixa) {
      if (!confirma) return
      evento.preventDefault()
      const largura = aberta.width / 3
      const altura = aberta.height / 3
      caixa.current = {
        x: (aberta.width - largura) / 2,
        y: (aberta.height - altura) / 2,
        width: largura,
        height: altura,
      }
      setCaixaAtiva(true)
      mostrarCaixa()
      return
    }

    if (confirma) {
      evento.preventDefault()
      confirmarCaixa()
      return
    }

    const passo = PASSO_DA_CAIXA * unidade()
    let { x, y, width, height } = atualCaixa
    switch (evento.key) {
      case 'ArrowLeft':
        if (evento.shiftKey) width -= passo
        else x -= passo
        break
      case 'ArrowRight':
        if (evento.shiftKey) width += passo
        else x += passo
        break
      case 'ArrowUp':
        if (evento.shiftKey) height -= passo
        else y -= passo
        break
      case 'ArrowDown':
        if (evento.shiftKey) height += passo
        else y += passo
        break
      default:
        return
    }
    evento.preventDefault()

    const minimo = MIN_CROP * unidade()
    width = Math.min(Math.max(width, minimo), aberta.width)
    height = Math.min(Math.max(height, minimo), aberta.height)
    x = Math.min(Math.max(x, 0), aberta.width - width)
    y = Math.min(Math.max(y, 0), aberta.height - height)
    caixa.current = { x, y, width, height }
    mostrarCaixa()
  }

  function arrastar(evento: PointerEvent<HTMLCanvasElement>) {
    if (gesto.current?.pointerId !== evento.pointerId) return
    mover(pontoDo(evento))
  }

  function soltar(evento: PointerEvent<HTMLCanvasElement>) {
    const g = gesto.current
    if (!g || g.pointerId !== evento.pointerId) return
    mover(pontoDo(evento))

    const marca = rascunho.current
    const recorte = recorteRascunho.current
    gesto.current = null
    rascunho.current = null
    recorteRascunho.current = null

    const e = atual.current.escala
    const grande = (rect: Rect, minimo: number) =>
      rect.width * e >= minimo && rect.height * e >= minimo

    if (ferramenta === 'crop') {
      if (recorte && grande(recorte, MIN_CROP)) aplicar((doc) => ({ ...doc, crop: recorte }))
      else agendar()
      return
    }

    if (!marca) return
    const vale =
      marca.type === 'pen' || marca.type === 'highlight'
        ? true
        : marca.type === 'arrow'
          ? Math.hypot(marca.to.x - marca.from.x, marca.to.y - marca.from.y) * e >= MIN_DRAG
          : 'rect' in marca && grande(marca.rect, MIN_DRAG)

    if (vale) adicionarMarca(marca)
    else agendar()
  }

  /** O ponteiro foi tirado do meio do gesto — o sistema pegou o toque. Nada fica. */
  function interromper(evento: PointerEvent<HTMLCanvasElement>) {
    if (gesto.current?.pointerId !== evento.pointerId) return
    gesto.current = null
    rascunho.current = null
    recorteRascunho.current = null
    agendar()
  }

  function escolher(tool: Tool) {
    if (caixa.current) desistirDaCaixa()
    setFerramenta(tool)
    setErro(null)
  }

  const desfazer = () => setHistoria(undo)
  const refazer = () => setHistoria(redo)

  function atalhos(evento: KeyboardEvent<HTMLDivElement>) {
    // Num campo de escrever, desfazer e as letras sao do proprio campo.
    const alvo = evento.target as HTMLElement
    if (alvo.tagName === 'TEXTAREA' || alvo.tagName === 'INPUT') return

    // + e - ampliam e diminuem, e 0 volta a caber, como nos visualizadores de imagem.
    if (!(evento.metaKey || evento.ctrlKey || evento.altKey) && !confirmando && !gerando) {
      const zoomPelaTecla =
        evento.key === '+' || evento.key === '='
          ? zoomAgora * PASSO_DO_ZOOM
          : evento.key === '-'
            ? zoomAgora / PASSO_DO_ZOOM
            : evento.key === '0'
              ? 1
              : null
      if (zoomPelaTecla !== null) {
        evento.preventDefault()
        ampliarPara(zoomPelaTecla)
        return
      }
    }

    // A letra de cada ferramenta escolhe a ferramenta, como nos editores de imagem.
    if (!(evento.metaKey || evento.ctrlKey)) {
      if (evento.altKey || evento.shiftKey || confirmando || gerando) return
      const atalho = TOOLS.find((item) => item.tecla.toLowerCase() === evento.key.toLowerCase())
      if (atalho) {
        evento.preventDefault()
        // Pelo teclado a troca e imediata: animar o que se repete muitas vezes cansa.
        pilula.semAnimacao()
        escolher(atalho.tool)
      }
      return
    }

    const tecla = evento.key.toLowerCase()
    if (tecla === 'z' && !evento.shiftKey) {
      evento.preventDefault()
      desfazer()
    } else if ((tecla === 'z' && evento.shiftKey) || tecla === 'y') {
      evento.preventDefault()
      refazer()
    }
  }

  // A caixa do teclado ainda aberta tambem e marca: sair sem perguntar jogaria fora o
  // que esta na tela.
  const mudou = historia.present !== inicial || caixaAtiva

  /** Sair: direto, sem nada mudado; perguntando, com marcas que se perderiam. */
  function pedirSaida() {
    if (gerando) return
    if (mudou && !falhou) setConfirmando(true)
    else onCancel()
  }

  function esc(evento: globalThis.KeyboardEvent) {
    evento.preventDefault()
    // No meio de uma composicao (acento, japones), o Esc e dela: desiste do candidato.
    if (evento.isComposing || evento.keyCode === 229) return
    if (caixa.current) {
      desistirDaCaixa()
      return
    }
    if (confirmando) {
      setConfirmando(false)
      return
    }
    pedirSaida()
  }

  async function concluir() {
    if (!aberta || gerando) return

    let doc = historia.present

    // **A caixa do teclado vai junto, e e a que nao pode faltar.** Na tela ela ja
    // aparece como a marca que vai virar — uma tarja preta, inteira. Concluir sem ela
    // mandaria o que a pessoa via coberto.
    const pendente = caixa.current
    if (pendente) {
      const marca = ferramenta === 'crop' ? null : marcaDoRetangulo(pendente)
      if (ferramenta === 'crop') doc = { ...doc, crop: pendente }
      else if (marca) doc = { ...doc, shapes: [...doc.shapes, marca] }
      desistirDaCaixa()
    }

    // A caixa vira passo da historia: se o arquivo falhar ou passar do teto, o editor fica
    // aberto com ela, agora confirmada.
    const final = doc
    if (final !== historia.present) setHistoria((agora) => commit(agora, final))

    // A imagem da lista, sem nada mudado: fica como esta, sem refazer a miniatura.
    if (doc === inicial && mode === 'save') {
      onCancel()
      return
    }
    if (isBlank(doc)) {
      onDone({ file: source, doc: null })
      return
    }

    setGerando(true)
    setErro(null)
    try {
      const file = await exportEdit(aberta, doc, source, maxBytes)
      // A qualidade desce e a imagem encolhe ate caber, mas uma enorme ainda pode passar
      // do teto — ver `canvasToImageFile`. Dizer aqui deixa a pessoa recortar, sem
      // perder as marcas.
      if (maxBytes !== null && file.size > maxBytes) {
        setErro(`A imagem marcada passa de ${formatBytes(maxBytes)}. Recorte um pedaço menor.`)
        setGerando(false)
        return
      }
      onDone({ file, doc })
    } catch {
      setErro('Não deu para gerar a imagem. Tente de novo.')
      setGerando(false)
    }
  }

  const dica = caixaAtiva ? CAIXA_HINT : (HINTS[ferramenta] ?? DEFAULT_HINT)
  /**
   * Os botoes do topo, **neutros, e nao na cor do formulario**: o editor e uma ferramenta
   * por cima do site, e a cor de destaque (o azul de fabrica, quando o projeto nao escolheu
   * outra) destoava do site de quem relata. Escuro na acao principal, como nos editores do
   * sistema, e combina com qualquer site.
   */
  const botao = cn(
    // Abaixo de 360, menos folga dos lados: em 320 o nome do meio era cortado.
    'inline-flex h-9 shrink-0 items-center justify-center rounded-xl border px-3.5 text-detail pointer-coarse:h-11 max-[360px]:px-2.5',
    'transition-[transform,background-color,color,opacity] duration-150 ease-out enabled:active:scale-[0.97]',
    'disabled:cursor-not-allowed disabled:text-fg-disabled',
  )
  /**
   * Os botoes da barra de baixo: ferramentas, desfazer e refazer. No toque, 40: o dedo nao
   * acerta 32, e no celular a barra quebra em linhas para caber (ver a barra).
   */
  const peca = cn(
    'relative flex size-8 items-center justify-center rounded-xl sm:size-9 pointer-coarse:size-10',
    // O aperto responde na hora, encolhendo um pouco: a barra nao parece morta.
    'transition-[transform,background-color,color] duration-150 ease-out enabled:active:scale-95',
    'disabled:cursor-not-allowed disabled:text-fg-disabled',
  )
  /**
   * A ferramenta na faixa do celular: o icone e o nome embaixo. No toque nao ha dica de
   * passar o mouse, e Desfoque, Ocultar e Marca-texto so pelo desenho eram adivinhacao.
   */
  const pecaComNome = cn(
    'relative flex h-14 min-w-16 flex-col items-center justify-center gap-1.5 rounded-xl px-2',
    'transition-[transform,background-color,color] duration-150 ease-out enabled:active:scale-95',
    'disabled:cursor-not-allowed disabled:text-fg-disabled',
  )
  // Na barra cinza, a escolhida e a peca clara e levantada; no hover, so o icone escurece.
  const solta = 'text-fg-muted enabled:hover:text-fg'
  /** Mac ou nao, para a dica do desfazer dizer a tecla que a pessoa aperta. */
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  /** As duas escolhas da pergunta de sair, de mesmo peso. */
  const secundario = cn(botao, 'border-border bg-surface text-fg enabled:hover:bg-surface-sunken')
  /** O "Cancelar" do topo: so o texto, para nao disputar com a acao principal. */
  const discreto = cn(
    botao,
    'border-transparent bg-transparent text-fg-muted enabled:hover:bg-surface-sunken enabled:hover:text-fg',
  )
  const principal = cn(
    botao,
    'border-transparent bg-fg font-medium text-surface enabled:hover:opacity-85 disabled:bg-surface-strong',
  )

  /**
   * Desfazer e refazer: no fim da barra no computador, e ao lado de recortar no celular. Um
   * lugar so de cada vez, pela largura (`useCelular`), e nao dois escondidos por CSS: o leitor
   * de tela e o teclado encontrariam o par escondido.
   */
  const desfazerRefazer = (
    <>
      <Dica texto="Desfazer" tecla={mac ? '⌘Z' : 'Ctrl+Z'}>
        <button
          type="button"
          aria-label="Desfazer"
          aria-keyshortcuts="Control+Z Meta+Z"
          disabled={historia.past.length === 0 || gerando}
          onClick={desfazer}
          className={cn(peca, solta)}
        >
          <EditorIcon name="undo" />
        </button>
      </Dica>
      <Dica texto="Refazer" tecla={mac ? '⇧⌘Z' : 'Ctrl+Shift+Z'}>
        <button
          type="button"
          aria-label="Refazer"
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
          disabled={historia.future.length === 0 || gerando}
          onClick={refazer}
          className={cn(peca, solta)}
        >
          <EditorIcon name="redo" />
        </button>
      </Dica>
    </>
  )

  /** As cores, numa linha: ao lado das ferramentas no computador, acima delas no celular. */
  const cores = (
    <fieldset className="flex items-center gap-0.5">
      <legend className="sr-only">Cor</legend>
      {INK_COLORS.map((opcao) => {
        const escolhida = cor === opcao.value
        return (
          <Dica key={opcao.value} texto={opcao.name}>
            <button
              type="button"
              aria-label={opcao.name}
              aria-pressed={escolhida}
              disabled={!COM_COR.has(ferramenta) || gerando}
              onClick={() => setCor(opcao.value)}
              className="group flex size-8 items-center justify-center rounded-full transition-[opacity,transform] duration-150 ease-out enabled:active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 pointer-coarse:size-10"
            >
              {/* A cor escolhida cresce com um leve pulo e ganha um anel por dentro, na
                          cor de contraste; as outras ficam menores e crescem ao passar o mouse.
                          A amostra e a cor que vai para a imagem, e nao muda com o tema. */}
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={cn(
                  'size-6 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none',
                  escolhida
                    ? 'scale-110 drop-shadow-sm'
                    : 'scale-75 group-enabled:group-hover:scale-90',
                )}
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10.5"
                  fill={opcao.value}
                  stroke="currentColor"
                  strokeOpacity="0.35"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="6"
                  fill="none"
                  stroke={opcao.contrast}
                  strokeWidth="2.2"
                  className={cn(
                    'origin-center transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] [transform-box:fill-box] motion-reduce:transition-none',
                    escolhida ? 'scale-100 opacity-100' : 'scale-0 opacity-0',
                  )}
                />
              </svg>
            </button>
          </Dica>
        )
      })}
    </fieldset>
  )

  /** Um grupo da barra: o fio antes dele, quando pedido, e as ferramentas dele. */
  const grupoDeFerramentas = (grupo: (typeof GRUPOS)[number], comFio: boolean) => (
    <span key={grupo} className={cn('flex items-center', !celular && 'gap-0.5')}>
      {comFio && <Divisoria />}
      {TOOLS.filter((item) => item.grupo === grupo).map(({ tool, label, curto, tecla }) => (
        <Dica key={tool} texto={label} tecla={tecla}>
          <button
            ref={tool === TOOLS[0]?.tool ? primeiraFerramenta : undefined}
            type="button"
            aria-label={label}
            aria-keyshortcuts={tecla}
            aria-pressed={ferramenta === tool}
            data-ferramenta={tool}
            // Ligadas mesmo com a imagem abrindo: o foco comeca na primeira, e nao cai em
            // "Descartar", onde um Enter jogaria a captura fora.
            disabled={gerando}
            onClick={() => escolher(tool)}
            className={cn(
              celular ? pecaComNome : peca,
              ferramenta === tool ? 'text-fg' : solta,
              // Sem a pilula medida (o primeiro desenho), o fundo marca a escolhida.
              ferramenta === tool && !pilula.lugar && 'bg-surface-lifted shadow-sm',
            )}
          >
            <EditorIcon name={tool} />
            {celular && <span className="text-caption leading-none">{curto}</span>}
          </button>
        </Dica>
      ))}
    </span>
  )

  return (
    <Dialog.Root
      open
      onOpenChange={(aberto) => {
        if (!aberto) pedirSaida()
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          style={accent}
          onEscapeKeyDown={esc}
          // Quem abriu o editor devolve o foco — ver `AttachmentEditor`. O Radix o
          // devolveria ao que tinha o foco antes, que pode ja nem existir.
          onCloseAutoFocus={(evento) => evento.preventDefault()}
          // O foco comeca na primeira ferramenta: o "Descartar" vem antes no topo, e um
          // Enter nele jogaria a captura fora.
          onOpenAutoFocus={(evento) => {
            evento.preventDefault()
            primeiraFerramenta.current?.focus()
          }}
          // Ocupa a tela inteira: nao ha "fora" para clicar, e nada fecha por engano.
          onPointerDownOutside={(evento) => evento.preventDefault()}
          onInteractOutside={(evento) => evento.preventDefault()}
          // Colar aqui dentro nao e anexar outra imagem na lista que esta atras.
          onPaste={(evento) => evento.stopPropagation()}
          onKeyDown={atalhos}
          className="fixed inset-0 z-dialog flex flex-col bg-surface-sunken text-fg"
        >
          {/* O topo: as saidas e o nome do que se faz aqui. As ferramentas ficam embaixo,
              perto da imagem e da mao, numa barra que flutua sobre o palco. */}
          <header className="flex min-h-14 items-center gap-3 border-border border-b bg-surface px-3 py-2 max-[360px]:gap-2">
            {confirmando ? (
              <>
                <Dialog.Title className="sr-only">Marcar a imagem</Dialog.Title>
                <p id={idPergunta} className="min-w-0 flex-1 text-detail text-fg">
                  {mode === 'add'
                    ? 'Descartar a imagem e as marcas?'
                    : 'Sair sem salvar as marcas?'}
                </p>
                {/* O foco vai para "Voltar", e a pergunta e lida junto com ele. */}
                <button
                  ref={voltar}
                  type="button"
                  aria-describedby={idPergunta}
                  onClick={() => setConfirmando(false)}
                  className={secundario}
                >
                  Voltar
                </button>
                <button type="button" onClick={onCancel} className={secundario}>
                  {mode === 'add' ? 'Descartar' : 'Sair sem salvar'}
                </button>
              </>
            ) : (
              <>
                {falhou ? (
                  <button type="button" onClick={onCancel} className={discreto}>
                    {mode === 'add' ? 'Descartar' : 'Fechar'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={pedirSaida}
                    disabled={gerando}
                    className={discreto}
                  >
                    {mode === 'add' ? 'Descartar' : 'Cancelar'}
                  </button>
                )}
                {celular ? (
                  // No celular, desfazer e refazer sobem para o topo, entre as saidas, como no
                  // editor do proprio telefone: embaixo fica so o que marca.
                  <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
                    <Dialog.Title className="sr-only">Marcar a imagem</Dialog.Title>
                    <Tooltip.Provider delayDuration={350}>{desfazerRefazer}</Tooltip.Provider>
                  </div>
                ) : (
                  <Dialog.Title className="min-w-0 flex-1 truncate text-center font-medium text-detail text-fg">
                    Marcar a imagem
                  </Dialog.Title>
                )}
                {falhou ? (
                  // A imagem que o editor nao abre ainda pode ir: a pessoa decide.
                  mode === 'add' ? (
                    <button
                      type="button"
                      onClick={() => onDone({ file: source, doc: null })}
                      className={principal}
                    >
                      Adicionar sem marcas
                    </button>
                  ) : (
                    <span className="w-20" aria-hidden="true" />
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => void concluir()}
                    disabled={!aberta || gerando}
                    className={principal}
                  >
                    {gerando ? 'Gerando…' : mode === 'add' ? 'Adicionar' : 'Salvar'}
                  </button>
                )}
              </>
            )}
          </header>

          {/* O palco: a imagem no meio, sobre uma trama de pontos discreta, como numa mesa
              de desenho. Ampliada, ele rola (com dois dedos, no toque: um dedo desenha), e a
              imagem, com `m-auto`, fica no meio quando cabe e encosta no inicio quando passa. */}
          <div className="relative flex min-h-0 flex-1">
            <div
              ref={setPalcoEl}
              onPointerDownCapture={tocarNoPalco}
              onPointerMoveCapture={moverNoPalco}
              onPointerUpCapture={soltarDoPalco}
              onPointerCancelCapture={soltarDoPalco}
              className={cn(
                'flex min-h-0 min-w-0 flex-1 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] p-4 [background-size:18px_18px]',
                zoomAgora > 1 ? 'overflow-auto overscroll-contain' : 'overflow-hidden',
              )}
            >
              {aberta ? (
                <div
                  ref={moldura}
                  className="relative m-auto flex-none"
                  style={{ width: larguraCss, height: alturaCss }}
                >
                  <canvas
                    ref={canvasRef}
                    width={Math.round(larguraCss * densidade)}
                    height={Math.round(alturaCss * densidade)}
                    role="img"
                    aria-label="A imagem, com as marcas"
                    aria-describedby={idAjuda}
                    // Alcancavel pelo Tab: e daqui que a caixa do teclado sai.
                    tabIndex={0}
                    onKeyDown={teclado}
                    onPointerDown={apertar}
                    onPointerMove={arrastar}
                    onPointerUp={soltar}
                    onPointerCancel={interromper}
                    // A captura do ponteiro some sem `pointercancel` em alguns toques: sem
                    // isto, o gesto ficaria preso e nenhum toque seguinte desenharia.
                    onLostPointerCapture={interromper}
                    // Sem isto, arrastar o dedo rolaria e daria zoom na pagina, em vez de desenhar.
                    className="block cursor-crosshair touch-none rounded-md shadow-xl ring-1 ring-border focus-visible:outline-offset-4"
                    style={{ width: larguraCss, height: alturaCss }}
                  />
                </div>
              ) : (
                <p className="m-auto max-w-xs text-center text-detail text-fg-muted leading-normal">
                  {falhou ? 'Não deu para abrir esta imagem para marcar.' : 'Abrindo a imagem…'}
                </p>
              )}
            </div>

            {/* O zoom, no canto do palco: diminuir, voltar a caber (so ampliada) e ampliar. */}
            {aberta && (
              <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-md">
                <button
                  type="button"
                  aria-label="Diminuir"
                  aria-keyshortcuts="-"
                  disabled={zoomAgora <= 1 || gerando}
                  onClick={() => ampliarPara(zoomAgora / PASSO_DO_ZOOM)}
                  className={cn(peca, solta, 'size-8 sm:size-8')}
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M3.5 8h9" />
                  </svg>
                </button>
                {zoomAgora > 1 && (
                  <button
                    type="button"
                    aria-keyshortcuts="0"
                    onClick={() => ampliarPara(1)}
                    disabled={gerando}
                    className="h-8 animate-fade-in rounded-lg px-2 text-caption text-fg-muted tabular-nums transition-colors hover:bg-surface-sunken hover:text-fg pointer-coarse:h-10"
                  >
                    Ajustar
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Ampliar"
                  aria-keyshortcuts="+"
                  disabled={zoomAgora >= zoomMaximo || gerando}
                  onClick={() => ampliarPara(zoomAgora * PASSO_DO_ZOOM)}
                  className={cn(peca, solta, 'size-8 sm:size-8')}
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M3.5 8h9M8 3.5v9" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Embaixo: a dica da ferramenta numa pilula, e a barra com tudo o que marca. No
              celular, um painel preso ao pe: a dica, as cores e uma faixa so de ferramentas
              com o nome embaixo, que rola de lado. Eram tres linhas de icones sem nome, com
              quase 300px, e a imagem ficava com o resto. */}
          {celular ? (
            <div className="flex flex-col gap-2 border-border border-t bg-surface pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="flex min-h-5 flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4">
                {erro && (
                  <p role="alert" className="text-caption text-error-fg leading-normal">
                    {erro}
                  </p>
                )}
                <p
                  aria-live="polite"
                  className="text-center text-caption text-fg-muted leading-normal"
                >
                  {dica}
                </p>
                <p id={idAjuda} className="sr-only">
                  Pelo teclado, com Retângulo, Elipse, Desfoque, Ocultar ou Recortar escolhido,
                  Enter põe uma caixa no meio da imagem. Cada ferramenta tem uma letra de atalho.
                </p>
                {ferramenta === 'crop' && historia.present.crop && (
                  <button
                    type="button"
                    onClick={() => aplicar((doc) => ({ ...doc, crop: null }))}
                    className="font-medium text-caption text-fg underline underline-offset-4 pointer-coarse:-my-3 pointer-coarse:py-3"
                  >
                    Sem recorte
                  </button>
                )}
              </div>
              <Tooltip.Provider delayDuration={350} skipDelayDuration={300}>
                <div className="flex justify-center">{cores}</div>
                <div className="overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div
                    ref={pilula.lista}
                    role="toolbar"
                    aria-label="Ferramentas"
                    className="relative mx-auto flex w-max items-center gap-0.5"
                  >
                    {pilula.lugar && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'pointer-events-none absolute top-0 left-0 rounded-xl bg-surface-sunken ring-1 ring-border',
                          pilula.animar &&
                            'transition-[transform,width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
                        )}
                        style={{
                          transform: `translate(${pilula.lugar.x}px, ${pilula.lugar.y}px)`,
                          width: pilula.lugar.largura,
                          height: pilula.lugar.altura,
                        }}
                      />
                    )}
                    {GRUPOS.map((grupo, indice) => grupoDeFerramentas(grupo, indice > 0))}
                  </div>
                </div>
              </Tooltip.Provider>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-3 pt-1 pb-3">
              <div className="flex min-h-7 max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1">
                {erro && (
                  <p
                    role="alert"
                    className="rounded-full border border-error-border bg-surface px-3 py-1 text-caption text-error-fg leading-normal"
                  >
                    {erro}
                  </p>
                )}
                <p
                  aria-live="polite"
                  className="rounded-full bg-surface/90 px-3 py-1 text-center text-caption text-fg-muted leading-normal"
                >
                  {dica}
                </p>
                <p id={idAjuda} className="sr-only">
                  Pelo teclado, com Retângulo, Elipse, Desfoque, Ocultar ou Recortar escolhido,
                  Enter põe uma caixa no meio da imagem. Cada ferramenta tem uma letra de atalho.
                </p>
                {ferramenta === 'crop' && historia.present.crop && (
                  <button
                    type="button"
                    onClick={() => aplicar((doc) => ({ ...doc, crop: null }))}
                    className="font-medium text-caption text-fg underline underline-offset-4 pointer-coarse:-my-3 pointer-coarse:py-3"
                  >
                    Sem recorte
                  </button>
                )}
              </div>

              <Tooltip.Provider delayDuration={350} skipDelayDuration={300}>
                <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border border-border bg-surface-sunken p-1.5 shadow-lg">
                  <div
                    ref={pilula.lista}
                    role="toolbar"
                    aria-label="Ferramentas"
                    // No computador, numa linha so. No celular e no tablet de pe, com o tamanho
                    // do dedo, nao cabe: duas linhas sem partir grupo, marcar em cima, e esconder,
                    // recortar, desfazer e refazer embaixo. As cores vao ao lado, ou embaixo.
                    className="relative flex flex-nowrap items-center justify-center gap-0.5"
                  >
                    {/* A ferramenta escolhida: uma pilula neutra que desliza ate a nova. */}
                    {pilula.lugar && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'pointer-events-none absolute top-0 left-0 rounded-xl bg-surface-lifted shadow-sm ring-1 ring-border',
                          pilula.animar &&
                            'transition-[transform,width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
                        )}
                        style={{
                          transform: `translate(${pilula.lugar.x}px, ${pilula.lugar.y}px)`,
                          width: pilula.lugar.largura,
                          height: pilula.lugar.altura,
                        }}
                      />
                    )}
                    {GRUPOS.map((grupo, indice) => grupoDeFerramentas(grupo, indice > 0))}
                  </div>

                  <Divisoria />

                  {cores}

                  <Divisoria />
                  <div className="flex items-center gap-0.5">{desfazerRefazer}</div>
                </div>
              </Tooltip.Provider>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** O fio entre os grupos da barra de baixo. */
function Divisoria({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('mx-0.5 h-6 w-px bg-border sm:mx-1', className)} />
}

/**
 * A dica de um botao da barra: o nome e a tecla, logo acima, escura como as do sistema,
 * ao passar o mouse.
 * **Entre vizinhos ela troca na hora**, sem esperar de novo nem animar, e quem passa pela
 * barra le cada nome sem atraso.
 */
function Dica({ texto, tecla, children }: { texto: string; tecla?: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      {/* So no mouse, e nao no foco: o editor abre com o foco na Seta, e uma dica aberta ali
          seguraria o primeiro Esc. Pelo teclado, o nome e a tecla vao no proprio botao. */}
      <Tooltip.Trigger asChild onFocus={(evento) => evento.preventDefault()}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={10}
          className="z-tip flex origin-(--radix-tooltip-content-transform-origin) items-center gap-2 rounded-lg bg-fg px-2.5 py-1.5 text-caption text-surface shadow-lg data-[state=closed]:animate-menu-out data-[state=delayed-open]:animate-menu-in"
        >
          {texto}
          {tecla && (
            <kbd className="rounded-md border border-surface/30 px-1.5 font-sans text-caption leading-snug opacity-80">
              {tecla}
            </kbd>
          )}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

/**
 * Onde fica a pilula da ferramenta escolhida: a posicao e o tamanho do botao dela, medidos
 * de novo a cada troca e quando a barra ou a janela muda de tamanho. `semAnimacao` faz a
 * proxima troca acontecer de uma vez, para o atalho do teclado.
 */
function usePilula(ferramenta: Tool) {
  const lista = useRef<HTMLDivElement>(null)
  const [lugar, setLugar] = useState<{
    x: number
    y: number
    largura: number
    altura: number
  } | null>(null)
  const [animar, setAnimar] = useState(false)
  const pular = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: a ferramenta e o gatilho de medir de novo
  useLayoutEffect(() => {
    const elemento = lista.current
    if (!elemento) return
    const medir = () => {
      const botao = elemento.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (!botao || botao.offsetWidth === 0) return
      setLugar({
        x: botao.offsetLeft,
        y: botao.offsetTop,
        largura: botao.offsetWidth,
        altura: botao.offsetHeight,
      })
    }
    // O primeiro lugar aparece de uma vez; as trocas seguintes deslizam, menos as do teclado.
    setAnimar((ja) => (pular.current ? false : ja || lugar !== null))
    pular.current = false
    medir()
    // A janela tambem: girar o celular (de 390 para 667) muda o fio entre os grupos e move a
    // escolhida da segunda linha sem mudar o tamanho da barra, e o observador nao via.
    window.addEventListener('resize', medir)
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir)
    observador?.observe(elemento)
    return () => {
      window.removeEventListener('resize', medir)
      observador?.disconnect()
    }
  }, [ferramenta])

  return {
    lista,
    lugar,
    animar,
    semAnimacao: () => {
      pular.current = true
    },
  }
}

/**
 * A barra cabe numa linha? Com mouse, a partir de 40rem (o `sm:`); no toque, com os botoes de
 * 40, so a partir de uns 800 pixels (51rem): no tablet de pe ela quebrava e deixava um fio
 * solto no fim da linha. Acompanha a troca, porque o quadro abre o editor na largura do
 * formulario e so depois cresce. Sem `matchMedia` (o ambiente de teste), e computador.
 */
const CONSULTA_COMPUTADOR = '(min-width: 40rem) and (pointer: fine), (min-width: 51rem)'

function consulta(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(CONSULTA_COMPUTADOR)
    : null
}

function useCelular() {
  const [celular, setCelular] = useState(() => {
    const lista = consulta()
    return lista !== null && !lista.matches
  })

  useEffect(() => {
    const lista = consulta()
    if (!lista) return
    const ouvir = () => setCelular(!lista.matches)
    ouvir()
    lista.addEventListener('change', ouvir)
    return () => lista.removeEventListener('change', ouvir)
  }, [])

  return celular
}
