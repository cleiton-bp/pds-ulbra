import * as Dialog from '@radix-ui/react-dialog'
import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
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
import { drawScene, hideMarginFor, LINE_HEIGHT } from '@/editor/render'
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

const TOOLS: { tool: Tool; label: string }[] = [
  { tool: 'arrow', label: 'Seta' },
  { tool: 'rect', label: 'Retângulo' },
  { tool: 'ellipse', label: 'Elipse' },
  { tool: 'pen', label: 'Desenho livre' },
  { tool: 'highlight', label: 'Marca-texto' },
  { tool: 'text', label: 'Texto' },
  { tool: 'step', label: 'Numeração' },
  { tool: 'blur', label: 'Desfoque' },
  { tool: 'hide', label: 'Ocultar' },
  { tool: 'crop', label: 'Recortar' },
]

/** As ferramentas que pintam com a cor escolhida. Desfoque, tarja e recorte nao tem cor. */
const COM_COR: ReadonlySet<Tool> = new Set([
  'arrow',
  'rect',
  'ellipse',
  'pen',
  'highlight',
  'text',
  'step',
])

/**
 * Os tamanhos, em pixels **da tela**. Viram pixels da imagem no gesto, pelo tamanho
 * com que ela aparece: a marca sai do tamanho que a pessoa viu ao desenhar, num
 * print de celular ou de monitor grande.
 */
const SIZE = { stroke: 3, highlight: 18, text: 18, stepRadius: 13, blurBlock: 14 }

/** Arrastar menos que isto, em pixels da tela, e um clique — e nao marca nada. */
export const MIN_DRAG = 4

/** O menor recorte, em pixels da tela. */
export const MIN_CROP = 8

/** A folga em volta da imagem no palco (o `p-4` dele). */
const FOLGA = 16

const HINTS: Partial<Record<Tool, string>> = {
  text: 'Clique onde o texto começa. Enter conclui; Shift+Enter quebra a linha.',
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

interface TextoAberto {
  at: Point
  value: string
  color: string
  size: number
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
  const [texto, setTextoState] = useState<TextoAberto | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [palco, setPalco] = useState({ width: 0, height: 0 })

  /**
   * O palco, em estado e nao em ref: o conteudo do dialogo entra na pagina um desenho
   * depois do editor, e so entao da para medir. Com ref, a medida rodava antes de o
   * palco existir e nunca mais — e a imagem aparecia do tamanho dela, maior que a tela.
   */
  const [palcoEl, setPalcoEl] = useState<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textoCampo = useRef<HTMLTextAreaElement>(null)
  const voltar = useRef<HTMLButtonElement>(null)

  /** O gesto em andamento, e o que ele desenha antes de soltar. Fora do estado: muda a cada movimento. */
  const gesto = useRef<Gesto | null>(null)
  const rascunho = useRef<Shape | null>(null)
  const recorteRascunho = useRef<Rect | null>(null)
  const quadro = useRef<number | null>(null)
  const textoRef = useRef<TextoAberto | null>(null)

  /** A caixa do teclado, em pixels da imagem. Ver `CAIXA`. */
  const caixa = useRef<Rect | null>(null)
  const [caixaAtiva, setCaixaAtiva] = useState(false)

  /** O aperto que concluiu um texto: o clique que vem dele nao abre outro. */
  const ignorarClique = useRef(false)

  const idAjuda = useId()
  const idPergunta = useId()

  // Sem medida — o ambiente de teste nao mede nada —, a imagem aparece do tamanho dela.
  const escala =
    aberta && palco.width > FOLGA * 2 && palco.height > FOLGA * 2
      ? Math.min(
          1,
          (palco.width - FOLGA * 2) / aberta.width,
          (palco.height - FOLGA * 2) / aberta.height,
        )
      : 1
  const densidade = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2)
  const larguraCss = aberta ? Math.max(1, Math.round(aberta.width * escala)) : 0
  const alturaCss = aberta ? Math.max(1, Math.round(aberta.height * escala)) : 0

  /** O que o desenho fora do React le: o quadro seguinte nao pode ver valores velhos. */
  const atual = useRef({ historia, escala, densidade, aberta })
  atual.current = { historia, escala, densidade, aberta }

  function setTexto(valor: TextoAberto | null) {
    textoRef.current = valor
    setTextoState(valor)
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

  // O texto aberto recebe o foco depois de montar: no clique, o navegador ainda estaria
  // levando o foco para outro lugar.
  const escrevendo = texto !== null
  useEffect(() => {
    if (escrevendo) textoCampo.current?.focus()
  }, [escrevendo])

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
    const u = unidade()
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
    const u = unidade()
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
    // Um dedo desenhando; o segundo nao comeca outra marca por cima.
    if (gesto.current) return

    ignorarClique.current = false
    // Clicar fora do texto aberto o conclui, e so: o clique nao comeca outra coisa.
    if (textoRef.current) {
      evento.preventDefault()
      ignorarClique.current = true
      concluirTexto()
      return
    }

    // O ponteiro toma o lugar da caixa do teclado.
    if (caixa.current) desistirDaCaixa()

    // O texto abre no clique, e nao aqui — ver `clicar`. No mouse, segurar o foco agora
    // impede o navegador de leva-lo para fora quando o campo abrir. **No dedo, nao:** no
    // Safari, inclusive o do iPhone, cancelar o pointerdown de um toque cancela tambem o
    // clique que vem depois — e o campo nunca abriria.
    if (ferramenta === 'text') {
      if (evento.pointerType !== 'touch') evento.preventDefault()
      return
    }

    const ponto = pontoDo(evento)

    if (ferramenta === 'step') {
      adicionarMarca({
        type: 'step',
        at: ponto,
        number: nextStepNumber(atual.current.historia.present),
        color: cor,
        radius: SIZE.stepRadius * unidade(),
      })
      return
    }

    evento.currentTarget.setPointerCapture?.(evento.pointerId)
    gesto.current = { pointerId: evento.pointerId, inicio: ponto, fim: ponto, pontos: [ponto] }
    mover(ponto)
  }

  /**
   * O texto abre no clique, **com o foco dado ali mesmo**. No iPhone, o teclado so
   * aparece quando o foco chega dentro do gesto da pessoa; dado depois, num efeito, o
   * campo abriria sem teclado.
   */
  function clicar(evento: MouseEvent<HTMLCanvasElement>) {
    if (ignorarClique.current) {
      ignorarClique.current = false
      return
    }
    if (ferramenta !== 'text' || !aberta || gerando || confirmando || textoRef.current) return

    const ponto = pontoDo(evento)
    flushSync(() => setTexto({ at: ponto, value: '', color: cor, size: SIZE.text * unidade() }))
    textoCampo.current?.focus()
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

  function marcaDoTexto(aberto: TextoAberto): Shape | null {
    const valor = aberto.value.replace(/\s+$/, '')
    if (valor.trim().length === 0) return null
    return { type: 'text', at: aberto.at, text: valor, color: aberto.color, size: aberto.size }
  }

  function concluirTexto() {
    const aberto = textoRef.current
    if (!aberto) return
    setTexto(null)
    const marca = marcaDoTexto(aberto)
    if (marca) adicionarMarca(marca)
  }

  function escolher(tool: Tool) {
    if (caixa.current) desistirDaCaixa()
    setFerramenta(tool)
    setErro(null)
  }

  const desfazer = () => setHistoria(undo)
  const refazer = () => setHistoria(redo)

  function atalhos(evento: KeyboardEvent<HTMLDivElement>) {
    // Dentro do texto, desfazer e o do proprio campo.
    if ((evento.target as HTMLElement).tagName === 'TEXTAREA') return
    if (!(evento.metaKey || evento.ctrlKey)) return

    const tecla = evento.key.toLowerCase()
    if (tecla === 'z' && !evento.shiftKey) {
      evento.preventDefault()
      desfazer()
    } else if ((tecla === 'z' && evento.shiftKey) || tecla === 'y') {
      evento.preventDefault()
      refazer()
    }
  }

  // A caixa do teclado e o texto ainda abertos tambem sao marcas: sair sem perguntar
  // jogaria fora o que esta na tela.
  const mudou = historia.present !== inicial || caixaAtiva || texto !== null

  /** Sair: direto, sem nada mudado; perguntando, com marcas que se perderiam. */
  function pedirSaida() {
    if (gerando) return
    if (mudou && !falhou) setConfirmando(true)
    else onCancel()
  }

  function esc(evento: globalThis.KeyboardEvent) {
    // O Esc chega aqui antes do campo de texto: e aqui que ele fecha so o texto.
    evento.preventDefault()
    // No meio de uma composicao (acento, japones), o Esc e dela: desiste do candidato.
    if (evento.isComposing || evento.keyCode === 229) return
    if (caixa.current) {
      desistirDaCaixa()
      return
    }
    if (textoRef.current) {
      setTexto(null)
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

    // O texto ainda aberto vai junto: quem digitou e concluiu quer o texto na imagem.
    let doc = historia.present
    const aberto = textoRef.current
    if (aberto) {
      setTexto(null)
      const marca = marcaDoTexto(aberto)
      if (marca) doc = { ...doc, shapes: [...doc.shapes, marca] }
    }

    // **A caixa do teclado tambem, e esta e a que nao pode faltar.** Na tela ela ja
    // aparece como a marca que vai virar — uma tarja preta, inteira. Concluir sem ela
    // mandaria o que a pessoa via coberto.
    const pendente = caixa.current
    if (pendente) {
      const marca = ferramenta === 'crop' ? null : marcaDoRetangulo(pendente)
      if (ferramenta === 'crop') doc = { ...doc, crop: pendente }
      else if (marca) doc = { ...doc, shapes: [...doc.shapes, marca] }
      desistirDaCaixa()
    }

    // O texto e a caixa viram passos da historia: se o arquivo falhar ou passar do teto,
    // o editor fica aberto com eles, agora confirmados.
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
  const acento = 'bg-[var(--widget-accent,var(--accent))] text-[var(--widget-ink,var(--accent-fg))]'
  const botao = cn(
    'inline-flex h-8 shrink-0 items-center justify-center rounded-lg border px-3 text-detail',
    'disabled:cursor-not-allowed disabled:text-fg-disabled',
  )
  const secundario = cn(botao, 'border-border bg-surface text-fg enabled:hover:bg-surface-sunken')
  const principal = cn(
    botao,
    'border-transparent font-medium enabled:hover:opacity-90 disabled:bg-surface-sunken',
    acento,
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
          // Ocupa a tela inteira: nao ha "fora" para clicar, e nada fecha por engano.
          onPointerDownOutside={(evento) => evento.preventDefault()}
          onInteractOutside={(evento) => evento.preventDefault()}
          // Colar aqui dentro nao e anexar outra imagem na lista que esta atras.
          onPaste={(evento) => evento.stopPropagation()}
          onKeyDown={atalhos}
          className="fixed inset-0 z-dialog flex flex-col bg-surface text-fg"
        >
          <Dialog.Title className="sr-only">Marcar a imagem</Dialog.Title>

          <div className="flex flex-col gap-1.5 border-border border-b px-3 py-2">
            <div role="toolbar" aria-label="Ferramentas" className="flex flex-wrap gap-1">
              {TOOLS.map(({ tool, label }) => (
                <button
                  key={tool}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={ferramenta === tool}
                  // Ligadas mesmo com a imagem abrindo: o foco comeca na primeira, e
                  // nao cai em "Descartar", onde um Enter jogaria a captura fora.
                  disabled={gerando}
                  onClick={() => escolher(tool)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg border border-transparent',
                    'disabled:cursor-not-allowed disabled:text-fg-disabled',
                    ferramenta === tool ? acento : 'text-fg enabled:hover:bg-surface-sunken',
                  )}
                >
                  <EditorIcon name={tool} />
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <fieldset className="flex items-center gap-0.5">
                <legend className="sr-only">Cor</legend>
                {INK_COLORS.map((opcao) => (
                  <button
                    key={opcao.value}
                    type="button"
                    aria-label={opcao.name}
                    title={opcao.name}
                    aria-pressed={cor === opcao.value}
                    disabled={!COM_COR.has(ferramenta) || gerando}
                    onClick={() => setCor(opcao.value)}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full border-2',
                      'disabled:cursor-not-allowed disabled:opacity-40',
                      cor === opcao.value ? 'border-fg' : 'border-transparent',
                    )}
                  >
                    {/* A amostra e a cor que vai para a imagem, e nao muda com o tema. */}
                    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
                      <circle
                        cx="10"
                        cy="10"
                        r="8.5"
                        fill={opcao.value}
                        stroke="currentColor"
                        strokeOpacity="0.3"
                      />
                    </svg>
                  </button>
                ))}
              </fieldset>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Desfazer"
                  title="Desfazer"
                  disabled={historia.past.length === 0 || gerando}
                  onClick={desfazer}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-fg enabled:hover:bg-surface-sunken disabled:cursor-not-allowed disabled:text-fg-disabled"
                >
                  <EditorIcon name="undo" />
                </button>
                <button
                  type="button"
                  aria-label="Refazer"
                  title="Refazer"
                  disabled={historia.future.length === 0 || gerando}
                  onClick={refazer}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-fg enabled:hover:bg-surface-sunken disabled:cursor-not-allowed disabled:text-fg-disabled"
                >
                  <EditorIcon name="redo" />
                </button>
              </div>
            </div>

            <div className="flex min-h-6 flex-wrap items-center gap-x-2">
              <p aria-live="polite" className="text-caption text-fg-muted leading-normal">
                {dica}
              </p>
              <p id={idAjuda} className="sr-only">
                Pelo teclado, com Retângulo, Elipse, Desfoque, Ocultar ou Recortar escolhido, Enter
                põe uma caixa no meio da imagem.
              </p>
              {ferramenta === 'crop' && historia.present.crop && (
                <button
                  type="button"
                  onClick={() => aplicar((doc) => ({ ...doc, crop: null }))}
                  className="font-medium text-caption text-fg underline underline-offset-4"
                >
                  Sem recorte
                </button>
              )}
            </div>
          </div>

          <div
            ref={setPalcoEl}
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-surface-sunken p-4"
          >
            {aberta ? (
              <div className="relative" style={{ width: larguraCss, height: alturaCss }}>
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
                  onClick={clicar}
                  onPointerDown={apertar}
                  onPointerMove={arrastar}
                  onPointerUp={soltar}
                  onPointerCancel={interromper}
                  // A captura do ponteiro some sem `pointercancel` em alguns toques: sem
                  // isto, o gesto ficaria preso e nenhum toque seguinte desenharia.
                  onLostPointerCapture={interromper}
                  // Sem isto, arrastar o dedo rolaria e daria zoom na pagina, em vez de desenhar.
                  className={cn(
                    'block touch-none focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-2',
                    ferramenta === 'text' ? 'cursor-text' : 'cursor-crosshair',
                  )}
                  style={{ width: larguraCss, height: alturaCss }}
                />
                {texto && (
                  <textarea
                    ref={textoCampo}
                    aria-label="Texto da marca"
                    value={texto.value}
                    rows={Math.max(1, texto.value.split('\n').length)}
                    // Sem quebra automatica: a linha que o campo quebrasse sozinho sairia
                    // inteira na imagem, e cortada na borda. Quebra so com Shift+Enter.
                    wrap="off"
                    onChange={(evento: ChangeEvent<HTMLTextAreaElement>) =>
                      setTexto({ ...texto, value: evento.target.value })
                    }
                    onKeyDown={(evento) => {
                      // O Enter que escolhe o candidato de uma composicao nao conclui. O Safari
                      // o manda sem `isComposing`, so com o codigo 229.
                      if (
                        evento.key === 'Enter' &&
                        !evento.shiftKey &&
                        !evento.nativeEvent.isComposing &&
                        evento.nativeEvent.keyCode !== 229
                      ) {
                        evento.preventDefault()
                        concluirTexto()
                      }
                    }}
                    onBlur={concluirTexto}
                    className="absolute resize-none overflow-hidden whitespace-pre rounded border border-border border-dashed bg-surface/80 p-0 font-semibold text-fg"
                    style={{
                      left: texto.at.x * escala,
                      top: texto.at.y * escala,
                      // Da largura da linha mais longa: o que se ve e o que vai.
                      width: `${Math.max(6, ...texto.value.split('\n').map((linha) => linha.length)) + 2}ch`,
                      fontSize: SIZE.text,
                      lineHeight: LINE_HEIGHT,
                    }}
                  />
                )}
              </div>
            ) : (
              <p className="max-w-xs text-center text-detail text-fg-muted leading-normal">
                {falhou ? 'Não deu para abrir esta imagem para marcar.' : 'Abrindo a imagem…'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-border border-t px-3 py-2">
            {erro && (
              <p role="alert" className="mr-auto text-caption text-error-fg leading-normal">
                {erro}
              </p>
            )}

            {confirmando ? (
              <>
                <p id={idPergunta} className="mr-auto text-detail text-fg">
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
            ) : falhou ? (
              <>
                <button type="button" onClick={onCancel} className={secundario}>
                  {mode === 'add' ? 'Descartar' : 'Fechar'}
                </button>
                {/* A imagem que o editor nao abre ainda pode ir: a pessoa decide. */}
                {mode === 'add' && (
                  <button
                    type="button"
                    onClick={() => onDone({ file: source, doc: null })}
                    className={principal}
                  >
                    Adicionar sem marcas
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={pedirSaida}
                  disabled={gerando}
                  className={secundario}
                >
                  {mode === 'add' ? 'Descartar' : 'Cancelar'}
                </button>
                <button
                  type="button"
                  onClick={() => void concluir()}
                  disabled={!aberta || gerando}
                  className={principal}
                >
                  {gerando ? 'Gerando…' : mode === 'add' ? 'Adicionar' : 'Salvar'}
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
