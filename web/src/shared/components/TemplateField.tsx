import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from 'react'
import {
  FACTORY_FALLBACKS,
  joinWidgetText,
  renderWidgetText,
  splitWidgetText,
  variableToken,
  type WidgetTextValues,
  type WidgetTextVariable,
} from '@/shared/lib/widgetText'

/** Como cada variavel aparece no botao e no bloco: o nome dela em portugues, sem as chaves. */
const ROTULO: Record<WidgetTextVariable, string> = {
  primeiroNome: 'primeiro nome',
  protocolo: 'protocolo',
  tipo: 'tipo',
  projeto: 'projeto',
  etapa: 'etapa',
}

/**
 * As variaveis que podem faltar de verdade, e a frase do campo que escolhe o que entra
 * no lugar. As outras sempre tem valor onde sao aceitas.
 */
const QUANDO_FALTA: Partial<Record<WidgetTextVariable, string>> = {
  primeiroNome: 'Quando a pessoa não disser o nome, escrever',
  etapa: 'Quando não houver etapa, escrever',
}

/** O teto do que entra no lugar da variavel que falta: uma palavra ou duas. */
const MAX_PADRAO = 40

/**
 * O bloco da variavel no texto: uma peca so, que nao se edita por dentro. No azul das
 * etiquetas, e nao no cinza dos botoes de baixo, para ler como variavel e nao como botao.
 */
const BLOCO =
  'mx-px inline-block cursor-default select-all rounded-md border border-chip-blue-border bg-chip-blue-surface px-1.5 align-baseline font-medium text-caption text-chip-blue-fg leading-5'

/** Ocupa o lugar do cursor antes e depois de um bloco nas pontas; nunca vai para o texto. */
const VAZIO = '​'

interface TemplateFieldProps {
  /** O `id` do campo, quando alguem precisa apontar para ele (`tela#campo`). */
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  maxLength: number
  /**
   * As variaveis que este texto aceita. Vazio e um texto sem variavel: sem botoes e sem
   * previa.
   */
  variables?: readonly WidgetTextVariable[]
  /** Os valores de exemplo da previa. */
  sample?: WidgetTextValues
  className?: string
}

/**
 * Um texto da ferramenta, com as variaveis a um clique e a previa logo embaixo.
 *
 * **Cada variavel e um bloco, e nao texto.** O botao poe o bloco onde esta o cursor, com
 * o nome em portugues, e ele so sai inteiro (o Backspace apaga o bloco todo): nao ha
 * chave para apagar pela metade nem nome para escrever errado. Quem digita ou cola a
 * variavel escrita (`{{primeiroNome}}`) ve ela virar bloco na hora. O que se grava
 * continua sendo o texto com as variaveis escritas, a forma que a API confere.
 *
 * **O que entra quando falta** (o nome de quem nao disse o nome) tem um campo proprio,
 * que so aparece quando o texto usa a variavel: ninguem precisa saber da barra do
 * `{{primeiroNome|pessoa}}`.
 *
 * **Uma linha so, que quebra sozinha**: o site mostra o texto num paragrafo, e o Enter
 * aqui nao faria nada la.
 *
 * **A previa troca com valores de exemplo** pela mesma funcao que o quadro e a pagina
 * usam: o que se ve aqui e o que vai aparecer.
 */
export function TemplateField({
  id,
  label,
  value,
  onChange,
  maxLength,
  variables = [],
  sample = {},
  className,
}: TemplateFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const labelId = `${fieldId}-rotulo`
  const editor = useRef<HTMLDivElement>(null)
  /** Onde o cursor estava no campo, para o botao, que tira o foco dele, inserir ali. */
  const guardado = useRef<Range | null>(null)
  const aceitas = useRef(variables)
  aceitas.current = variables
  const teto = useRef(maxLength)
  teto.current = maxLength
  const mudar = useRef(onChange)
  mudar.current = onChange
  /**
   * O desfazer do proprio campo, igual em todo navegador: o do navegador se perde com
   * as mudancas que o campo faz sozinho (o bloco que entra, o que sai inteiro), e no
   * Safari desfazia demais e embaralhava o texto. Cada estado guarda onde estava o cursor.
   */
  const historico = useRef<Historico>({
    estados: [{ valor: value, cursor: null }],
    atual: 0,
    ultimoTipo: '',
    quando: 0,
  })

  /** Guarda o estado novo no historico e avisa quem usa. */
  function emitir(raiz: HTMLElement, tipo: 'digitar' | 'apagar' | 'outro') {
    const valor = lerTexto(raiz)
    registrar(historico.current, valor, posicaoDoCursor(raiz), tipo)
    onChange(valor)
  }
  const emitirAgora = useRef(emitir)
  emitirAgora.current = emitir

  /** Desfaz (-1) ou refaz (1) pelo historico do campo. */
  function voltar(passo: -1 | 1) {
    const raiz = editor.current
    const h = historico.current
    const estado = h.estados[h.atual + passo]
    if (!raiz || !estado) return
    h.atual += passo
    h.ultimoTipo = ''
    desenhar(raiz, estado.valor, aceitas.current)
    porCursor(raiz, estado.cursor ?? Number.POSITIVE_INFINITY)
    onChange(estado.valor)
  }
  const voltarAgora = useRef(voltar)
  voltarAgora.current = voltar

  // O texto de fora (o salvo, o descartado, o padrao) redesenha o campo; o que veio do
  // proprio campo ja esta nele, e redesenhar so moveria o cursor.
  useLayoutEffect(() => {
    const raiz = editor.current
    if (!raiz || lerTexto(raiz) === value) return
    desenhar(raiz, value, aceitas.current)
    registrar(historico.current, value, null, 'outro')
  }, [value])

  useEffect(() => {
    const raiz = editor.current
    if (!raiz) return

    const guardar = () => {
      const trecho = trechoDentro(raiz)
      if (trecho) guardado.current = trecho
    }

    // O teto e a linha unica, antes de o navegador mexer no campo.
    const antesDeEntrar = (evento: InputEvent) => {
      if (evento.inputType === 'historyUndo' || evento.inputType === 'historyRedo') {
        evento.preventDefault()
        voltarAgora.current(evento.inputType === 'historyUndo' ? -1 : 1)
        return
      }
      if (evento.inputType === 'insertParagraph' || evento.inputType === 'insertLineBreak') {
        evento.preventDefault()
        return
      }
      if (!evento.inputType.startsWith('insert') || evento.inputType === 'insertFromPaste') return
      const entrando = evento.data ?? evento.dataTransfer?.getData('text/plain') ?? ''
      if (tamanhoDepois(raiz, entrando.length) > teto.current) evento.preventDefault()
    }

    // Colar entra como texto, numa linha, e a variavel escrita vira bloco. O que nao
    // cabe no teto fica de fora, como no campo comum.
    const colar = (evento: ClipboardEvent) => {
      evento.preventDefault()
      const texto = (evento.clipboardData?.getData('text/plain') ?? '').replace(
        /\s*[\r\n]+\s*/g,
        ' ',
      )
      const cabe = teto.current - tamanhoDepois(raiz, 0)
      const partes = caber(splitWidgetText(texto, aceitas.current), cabe)
      if (partes.length === 0) return
      inserirPartes(raiz, partes)
      emitirAgora.current(raiz, 'outro')
    }

    document.addEventListener('selectionchange', guardar)
    raiz.addEventListener('beforeinput', antesDeEntrar)
    raiz.addEventListener('paste', colar)
    return () => {
      document.removeEventListener('selectionchange', guardar)
      raiz.removeEventListener('beforeinput', antesDeEntrar)
      raiz.removeEventListener('paste', colar)
    }
  }, [])

  // O bloco e uma peca so tambem para o teclado: o Backspace e o Delete apagam ele
  // inteiro, e as setas passam por ele de uma vez, sem parar no lugar invisivel do lado.
  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Enter') {
      evento.preventDefault()
      return
    }
    const atalho = (evento.metaKey || evento.ctrlKey) && !evento.altKey
    const tecla = evento.key.toLowerCase()
    if (atalho && (tecla === 'z' || (tecla === 'y' && evento.ctrlKey))) {
      evento.preventDefault()
      voltar(tecla === 'z' && !evento.shiftKey ? -1 : 1)
      return
    }
    const raiz = evento.currentTarget
    const apagar = evento.key === 'Backspace' || evento.key === 'Delete'
    const andar = evento.key === 'ArrowLeft' || evento.key === 'ArrowRight'
    if ((!apagar && !andar) || evento.shiftKey || evento.altKey || evento.metaKey || evento.ctrlKey)
      return
    const lado = evento.key === 'Backspace' || evento.key === 'ArrowLeft' ? 'antes' : 'depois'
    const bloco = blocoAoLado(raiz, lado)
    if (!bloco) return
    evento.preventDefault()
    if (andar) {
      if (lado === 'antes') cursorAntes(bloco)
      else cursorDepois(bloco)
      return
    }
    // O cursor fica onde o bloco estava.
    const lugar = unidadesAte(raiz, bloco)
    bloco.remove()
    ajeitarPontas(raiz)
    porCursor(raiz, lugar)
    emitir(raiz, 'outro')
  }

  function aoDigitar(evento: FormEvent<HTMLDivElement>) {
    const raiz = evento.currentTarget
    const virouBloco = transformarEscritas(raiz, aceitas.current)
    ajeitarPontas(raiz)
    const tipo = (evento.nativeEvent as InputEvent).inputType ?? ''
    emitir(
      raiz,
      virouBloco
        ? 'outro'
        : tipo.startsWith('insert')
          ? 'digitar'
          : tipo.startsWith('delete')
            ? 'apagar'
            : 'outro',
    )
  }

  function inserir(variavel: WidgetTextVariable) {
    const raiz = editor.current
    if (!raiz) return
    const trecho = trechoDentro(raiz) ?? guardado.current ?? fimDe(raiz)
    // Cortar no teto partiria a variavel no meio, e o que sobrasse seria recusado ao
    // gravar. Sem espaco, nada entra.
    if (lerTexto(raiz).length - tamanhoDe(trecho) + variableToken(variavel).length > maxLength)
      return
    raiz.focus()
    selecionar(trecho)
    inserirPartes(raiz, [{ variable: variavel }])
    emitir(raiz, 'outro')
  }

  function trocarPadrao(variavel: WidgetTextVariable, escrito: string) {
    // Chave no padrao abriria ou fecharia uma variavel que nao existe.
    const limpo = escrito.replace(/[{}]/g, '').slice(0, MAX_PADRAO)
    const novo = joinWidgetText(
      splitWidgetText(value, variables).map((parte) =>
        'variable' in parte && parte.variable === variavel
          ? { variable: variavel, ...(limpo === '' ? {} : { fallback: limpo }) }
          : parte,
      ),
    )
    if (novo.length <= maxLength) onChange(novo)
  }

  const partes = splitWidgetText(value, variables)
  const usadas = new Set(partes.flatMap((parte) => ('variable' in parte ? [parte.variable] : [])))
  const comPadrao = variables.filter((variavel) => QUANDO_FALTA[variavel] && usadas.has(variavel))

  return (
    <div className={className}>
      {/* O rotulo nao e um <label>: o campo e um editor, e nao um input. O clique nele
          leva o foco ao campo, como faria o rotulo. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: atalho do mouse; pelo teclado, o Tab ja chega ao campo */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: o rotulo so repete o foco do campo, que tem o proprio papel */}
      <div
        id={labelId}
        onClick={() => editor.current?.focus()}
        className="mb-1.5 block text-detail text-fg-muted"
      >
        {label}
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: o campo precisa de blocos dentro do texto, o que um textarea nao desenha */}
      <div
        ref={editor}
        id={fieldId}
        role="textbox"
        aria-multiline="false"
        aria-labelledby={labelId}
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={aoDigitar}
        onKeyDown={aoTeclar}
        onDrop={(evento) => evento.preventDefault()}
        className="min-h-16 w-full cursor-text whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-raised px-3 py-2 text-body text-fg leading-relaxed"
      />

      {variables.length > 0 && (
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-fg-muted">Inserir:</span>
            {variables.map((variavel) => (
              <button
                key={variavel}
                type="button"
                title={`Põe o ${ROTULO[variavel]} onde está o cursor`}
                // O clique nao tira o cursor do campo: o bloco entra onde ele estava.
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={() => inserir(variavel)}
                className="h-6 rounded-md border border-border bg-surface px-2 text-caption text-fg hover:bg-surface-sunken"
              >
                {ROTULO[variavel]}
              </button>
            ))}
          </div>

          {comPadrao.map((variavel) => {
            const atual = partes.find(
              (parte) => 'variable' in parte && parte.variable === variavel,
            ) as { fallback?: string } | undefined
            return (
              <label
                key={variavel}
                className="mt-2.5 flex flex-wrap items-center gap-2 text-caption text-fg-muted"
              >
                {QUANDO_FALTA[variavel]}
                <input
                  type="text"
                  value={atual?.fallback ?? ''}
                  placeholder={FACTORY_FALLBACKS[variavel]}
                  maxLength={MAX_PADRAO}
                  onChange={(evento) => trocarPadrao(variavel, evento.target.value)}
                  className="h-7 w-44 rounded-md border border-border bg-surface-raised px-2 text-detail text-fg placeholder:text-fg-placeholder"
                />
              </label>
            )
          })}

          {/* A previa e texto puro, como no site: o React escapa o que vier. */}
          <div className="mt-2.5 rounded-lg border border-border border-dashed bg-surface px-3 py-2 text-detail leading-normal">
            <p className="break-words text-fg">{renderWidgetText(value, sample)}</p>
            {usadas.has('primeiroNome') && (
              <p className="mt-1 break-words text-fg-muted">
                <span className="text-caption">sem nome: </span>
                {renderWidgetText(value, { ...sample, primeiroNome: null })}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------
// O campo por dentro: o texto e os blocos no DOM, e o caminho de volta ao texto gravado.

function criarBloco(variavel: WidgetTextVariable, fallback?: string): HTMLSpanElement {
  const bloco = document.createElement('span')
  bloco.contentEditable = 'false'
  bloco.dataset.variavel = variavel
  if (fallback !== undefined) bloco.dataset.padrao = fallback
  bloco.className = BLOCO
  bloco.textContent = ROTULO[variavel]
  return bloco
}

/** Os pedacos como nos do campo: texto, ou o bloco da variavel. */
function nosDe(partes: ReturnType<typeof splitWidgetText>): Node[] {
  return partes.map((parte) =>
    'variable' in parte
      ? criarBloco(parte.variable, parte.fallback)
      : document.createTextNode(parte.text),
  )
}

function desenhar(raiz: HTMLElement, valor: string, aceitas: readonly WidgetTextVariable[]) {
  raiz.replaceChildren(...nosDe(splitWidgetText(valor, aceitas)))
  ajeitarPontas(raiz)
}

/** O texto que se grava: o escrito, e cada bloco de volta a `{{variavel}}`. */
function lerTexto(no: Node): string {
  let saida = ''
  for (const filho of no.childNodes) {
    if (filho.nodeType === Node.TEXT_NODE) {
      saida += (filho.nodeValue ?? '').replaceAll(VAZIO, '').replaceAll(' ', ' ')
    } else if (filho instanceof HTMLElement && filho.dataset.variavel) {
      saida += variableToken(filho.dataset.variavel as WidgetTextVariable, filho.dataset.padrao)
    } else if (filho.nodeName !== 'BR') {
      saida += lerTexto(filho)
    }
  }
  return saida
}

/**
 * Um lugar para o cursor antes do bloco no comeco, depois do bloco no fim e entre dois
 * blocos: sem texto ali, o navegador nao tem onde por o cursor, e a pessoa nao
 * conseguiria escrever depois da ultima variavel.
 */
function ajeitarPontas(raiz: HTMLElement) {
  for (const filho of [...raiz.childNodes]) {
    if (ehBloco(filho) && (filho.previousSibling === null || ehBloco(filho.previousSibling)))
      raiz.insertBefore(document.createTextNode(VAZIO), filho)
  }
  if (ehBloco(raiz.lastChild)) raiz.append(document.createTextNode(VAZIO))
}

/**
 * A variavel escrita a mao, ou colada, vira bloco: o que esta no campo e sempre o que
 * a pessoa ve. O cursor vai para depois do ultimo bloco novo.
 */
function transformarEscritas(raiz: HTMLElement, aceitas: readonly WidgetTextVariable[]): boolean {
  const textos: Text[] = []
  const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  while (andador.nextNode()) textos.push(andador.currentNode as Text)

  let ultimo: Node | null = null
  for (const texto of textos) {
    if (!(texto.nodeValue ?? '').includes('{{')) continue
    const partes = splitWidgetText(texto.nodeValue ?? '', aceitas)
    if (!partes.some((parte) => 'variable' in parte)) continue
    const nos = nosDe(partes)
    ultimo = nos.at(-1) ?? null
    texto.replaceWith(...nos)
  }
  if (ultimo) cursorDepois(ultimo)
  return ultimo !== null
}

/** Insere os pedacos onde esta a selecao do campo, trocando o que estiver marcado. */
function inserirPartes(raiz: HTMLElement, partes: ReturnType<typeof splitWidgetText>) {
  const trecho = trechoDentro(raiz) ?? fimDe(raiz)
  trecho.deleteContents()
  const nos = nosDe(partes)
  const fragmento = document.createDocumentFragment()
  fragmento.append(...nos)
  trecho.insertNode(fragmento)
  ajeitarPontas(raiz)
  const ultimo = nos.at(-1)
  if (ultimo) cursorDepois(ultimo)
}

/** Os pedacos que cabem em `espaco` letras do texto gravado: o texto se corta, o bloco nao. */
function caber(partes: ReturnType<typeof splitWidgetText>, espaco: number) {
  const saida: ReturnType<typeof splitWidgetText> = []
  let resta = espaco
  for (const parte of partes) {
    const tamanho = joinWidgetText([parte]).length
    if (tamanho <= resta) {
      saida.push(parte)
      resta -= tamanho
    } else {
      if ('text' in parte && resta > 0) saida.push({ text: parte.text.slice(0, resta) })
      break
    }
  }
  return saida
}

function trechoDentro(raiz: HTMLElement): Range | null {
  const selecao = window.getSelection()
  if (!selecao || selecao.rangeCount === 0) return null
  const trecho = selecao.getRangeAt(0)
  return raiz.contains(trecho.commonAncestorContainer) ? trecho.cloneRange() : null
}

function fimDe(raiz: HTMLElement): Range {
  const trecho = document.createRange()
  trecho.selectNodeContents(raiz)
  trecho.collapse(false)
  return trecho
}

function tamanhoDe(trecho: Range): number {
  return lerTexto(trecho.cloneContents()).length
}

/** Quanto o texto gravado teria depois de trocar a selecao por `entrando` letras. */
function tamanhoDepois(raiz: HTMLElement, entrando: number): number {
  const trecho = trechoDentro(raiz)
  return lerTexto(raiz).length - (trecho ? tamanhoDe(trecho) : 0) + entrando
}

function selecionar(trecho: Range) {
  const selecao = window.getSelection()
  selecao?.removeAllRanges()
  selecao?.addRange(trecho)
}

interface Historico {
  estados: { valor: string; cursor: number | null }[]
  atual: number
  ultimoTipo: string
  quando: number
}

/**
 * Guarda um estado. **A digitacao seguida vira um passo so**, como nos editores: o
 * desfazer volta a palavra, e nao letra por letra.
 */
function registrar(h: Historico, valor: string, cursor: number | null, tipo: string) {
  if (h.estados[h.atual]?.valor === valor) return
  const agora = Date.now()
  const junta = tipo !== 'outro' && tipo === h.ultimoTipo && agora - h.quando < 1000 && h.atual > 0
  h.estados = h.estados.slice(0, h.atual + 1)
  if (junta) h.estados[h.atual] = { valor, cursor }
  else h.estados.push({ valor, cursor })
  if (h.estados.length > 100) h.estados.shift()
  h.atual = h.estados.length - 1
  h.ultimoTipo = tipo
  h.quando = agora
}

/** Quanto o no ocupa para o cursor: cada letra vale um, o bloco inteiro vale um. */
function unidades(no: Node): number {
  let total = 0
  for (const filho of no.childNodes) {
    if (filho.nodeType === Node.TEXT_NODE)
      total += (filho.nodeValue ?? '').replaceAll(VAZIO, '').length
    else if (ehBloco(filho)) total += 1
    else total += unidades(filho)
  }
  return total
}

/** Onde esta o cursor, em unidades desde o comeco do campo. */
function posicaoDoCursor(raiz: HTMLElement): number | null {
  const selecao = window.getSelection()
  if (!selecao || selecao.rangeCount === 0) return null
  const trecho = selecao.getRangeAt(0)
  if (!raiz.contains(trecho.endContainer)) return null
  const antes = document.createRange()
  antes.selectNodeContents(raiz)
  antes.setEnd(trecho.endContainer, trecho.endOffset)
  return unidades(antes.cloneContents())
}

/** As unidades antes do no, desde o comeco do campo. */
function unidadesAte(raiz: HTMLElement, no: Node): number {
  const antes = document.createRange()
  antes.selectNodeContents(raiz)
  antes.setEndBefore(no)
  return unidades(antes.cloneContents())
}

/** Poe o cursor na posicao, em unidades; alem do fim, no fim. */
function porCursor(raiz: HTMLElement, alvo: number) {
  let resta = alvo
  for (const filho of raiz.childNodes) {
    if (filho instanceof Text) {
      const valor = filho.nodeValue ?? ''
      let vistos = 0
      for (let i = 0; i <= valor.length; i++) {
        if (vistos === resta && (i === valor.length || valor[i] !== VAZIO)) {
          const trecho = document.createRange()
          trecho.setStart(filho, i)
          trecho.collapse(true)
          selecionar(trecho)
          return
        }
        if (i < valor.length && valor[i] !== VAZIO) vistos++
      }
      resta -= vistos
    } else if (ehBloco(filho)) {
      if (resta === 0) {
        cursorAntes(filho)
        return
      }
      resta -= 1
    }
  }
  selecionar(fimDe(raiz))
}

const ehBloco = (no: Node | null | undefined): no is HTMLElement =>
  no instanceof HTMLElement && !!no.dataset.variavel

/**
 * O bloco grudado no cursor, do lado pedido, pulando o lugar invisivel que fica ao lado
 * dele. Nulo quando ha texto de verdade entre o cursor e o bloco, ou o cursor esta marcando
 * um trecho.
 */
function blocoAoLado(raiz: HTMLElement, lado: 'antes' | 'depois'): HTMLElement | null {
  const selecao = window.getSelection()
  if (!selecao || selecao.rangeCount === 0 || !selecao.isCollapsed) return null
  const { startContainer: no, startOffset: posicao } = selecao.getRangeAt(0)
  if (!raiz.contains(no)) return null
  if (no instanceof Text) {
    const valor = no.nodeValue ?? ''
    const entre = lado === 'antes' ? valor.slice(0, posicao) : valor.slice(posicao)
    if (entre.replaceAll(VAZIO, '') !== '') return null
    const vizinho = lado === 'antes' ? no.previousSibling : no.nextSibling
    return ehBloco(vizinho) ? vizinho : null
  }
  let vizinho: Node | null | undefined =
    lado === 'antes' ? no.childNodes[posicao - 1] : no.childNodes[posicao]
  if (vizinho instanceof Text && (vizinho.nodeValue ?? '').replaceAll(VAZIO, '') === '')
    vizinho = lado === 'antes' ? vizinho.previousSibling : vizinho.nextSibling
  return ehBloco(vizinho) ? vizinho : null
}

/** O cursor logo antes do no, dentro do texto que vem antes, pela mesma razao do depois. */
function cursorAntes(no: Node) {
  let anterior = no.previousSibling
  if (!(anterior instanceof Text)) {
    anterior = document.createTextNode(VAZIO)
    no.parentNode?.insertBefore(anterior, no)
  }
  const texto = anterior as Text
  const valor = texto.nodeValue ?? ''
  const trecho = document.createRange()
  trecho.setStart(texto, valor.endsWith(VAZIO) ? valor.length - 1 : valor.length)
  trecho.collapse(true)
  selecionar(trecho)
}

/**
 * O cursor logo depois do no, dentro do texto que vem em seguida: posto entre elementos,
 * ao lado de um bloco, o navegador o empurra para dentro do bloco. Sem texto depois, nasce
 * um lugar vazio para ele.
 */
function cursorDepois(no: Node) {
  let seguinte = no.nextSibling
  if (!(seguinte instanceof Text)) {
    seguinte = document.createTextNode(VAZIO)
    no.parentNode?.insertBefore(seguinte, no.nextSibling)
  }
  const texto = seguinte as Text
  const trecho = document.createRange()
  trecho.setStart(texto, (texto.nodeValue ?? '').startsWith(VAZIO) ? 1 : 0)
  trecho.collapse(true)
  selecionar(trecho)
}
