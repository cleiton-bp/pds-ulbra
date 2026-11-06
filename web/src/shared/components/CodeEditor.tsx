import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useScrollOnlyForContent } from '@/shared/hooks/useScrollOnlyForContent'
import { FADE_RIGHT, useSideScroll } from '@/shared/hooks/useSideScroll'
import { copyText } from '@/shared/lib/clipboard'
import { cn } from '@/shared/lib/cn'
import { type CodeLanguage, highlight, type TokenKind } from '@/shared/lib/highlight'

/** Um arquivo do editor: o nome na aba, o desenho ao lado e o codigo. */
export interface CodeFile {
  id: string
  /** O nome do arquivo, na aba e para o leitor de tela (`cracha.js`). */
  name: string
  /** O nome curto da aba que nao esta aberta, ao lado do desenho (`Node`). */
  label?: string
  language: CodeLanguage
  code: string
  icon?: ReactNode
  /**
   * As linhas novas (contando de 1), quando o trecho mostra o que acrescentar a um codigo
   * que a pessoa ja tem: elas ganham o "+" na margem e as cores, e as outras ficam
   * apagadas, para ficar claro o que entra e o que ja esta la.
   */
  added?: readonly number[]
}

const COR: Record<TokenKind, string> = {
  plain: '',
  comment: 'text-code-muted italic',
  string: 'text-code-string',
  number: 'text-code-number',
  keyword: 'text-code-keyword',
  name: 'text-code-name',
  variable: 'text-code-tag',
  tag: 'text-code-tag',
}

/**
 * Um trecho de codigo com cara de editor: a barra de cima com o arquivo (ou as abas, um
 * arquivo por linguagem), o copiar, os numeros de linha e as cores da sintaxe. **E o que
 * faz quem configura ler o trecho como codigo para levar**, e nao como texto da tela.
 *
 * **Acompanha o tema da tela** (os tokens `code-*`): claro no claro, escuro no escuro, com
 * as cores da sintaxe conferidas nos dois. **A linha nao quebra**:
 * codigo quebrado no meio muda de sentido, e a linha comprida rola de lado.
 *
 * **Com mais de um arquivo, as abas sao a escolha da linguagem**, como num editor: cada
 * aba tem o desenho e, a aberta, o nome do arquivo; as outras ganham o nome da linguagem
 * quando o editor e largo o bastante. As setas andam entre elas, como abas.
 *
 * **A troca e suave**: o fio da aba aberta desliza ate a nova, o nome abre e fecha em
 * largura (as abas nao pulam de lugar), o codigo entra esmaecendo e o editor acompanha a
 * altura do codigo novo. Quem pede menos movimento ao sistema ve a troca de uma vez.
 * A escolha mora em quem usa (`active`), para a tela guardar a linguagem entre um trecho
 * e outro.
 */
export function CodeEditor({
  files,
  active,
  onActiveChange,
  ariaLabel,
  className,
}: {
  files: readonly CodeFile[]
  /** O arquivo aberto. Sem ele, o primeiro. */
  active?: string
  onActiveChange?: (id: string) => void
  /** O nome do grupo de abas, para o leitor de tela (`Linguagem do seu servidor`). */
  ariaLabel?: string
  className?: string
}) {
  const ids = useId()
  const aberto = files.find((file) => file.id === active) ?? files[0]
  const abas = files.length > 1
  const fio = useFioDaAba(aberto?.id)
  // As abas de linguagem que nao cabem rolam de lado; a borda direita esmaece enquanto ha
  // mais para ver (no celular, quatro das seis ficavam escondidas sem dica nenhuma).
  const { maisADireita } = useSideScroll(fio.lista)
  const altura = useAlturaQueAcompanha()
  if (!aberto) return null

  function aoTeclar(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const atual = files.findIndex((file) => file.id === aberto?.id)
    const destino =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? files.length - 1
          : (atual + (event.key === 'ArrowRight' ? 1 : -1) + files.length) % files.length
    const alvo = files[destino]
    if (!alvo) return
    onActiveChange?.(alvo.id)
    document.getElementById(`${ids}-aba-${alvo.id}`)?.focus()
  }

  return (
    <div
      className={cn(
        '@container overflow-hidden rounded-xl border border-code-border bg-code-surface text-code-fg shadow-sm',
        className,
      )}
    >
      <div className="flex items-stretch border-code-border border-b bg-code-bar">
        {abas ? (
          <div
            ref={fio.lista}
            role="tablist"
            aria-label={ariaLabel}
            onKeyDown={aoTeclar}
            className={cn(
              'relative flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]',
              maisADireita && FADE_RIGHT,
            )}
          >
            {files.map((file) => {
              const ligado = file.id === aberto.id
              return (
                <button
                  key={file.id}
                  id={`${ids}-aba-${file.id}`}
                  type="button"
                  role="tab"
                  aria-selected={ligado}
                  aria-controls={`${ids}-codigo`}
                  aria-label={file.label ?? file.name}
                  title={file.label ?? file.name}
                  tabIndex={ligado ? 0 : -1}
                  onClick={() => onActiveChange?.(file.id)}
                  className={cn(
                    'relative flex flex-none items-center border-code-border border-r px-3 py-2 font-mono text-caption transition-colors duration-300 ease-out focus-visible:-outline-offset-2 motion-reduce:transition-none',
                    ligado ? 'bg-code-surface text-code-fg' : 'text-code-muted hover:text-code-fg',
                  )}
                >
                  {file.icon}
                  {/* A aberta diz o arquivo; as outras, so o desenho quando falta lugar, e o
                      nome quando o editor e largo (pela largura dele, e nao da janela). O
                      nome abre e fecha em largura, e as abas vizinhas andam junto, sem pular. */}
                  <span
                    className={cn(
                      'grid transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                      ligado
                        ? 'grid-cols-[1fr] opacity-100'
                        : 'grid-cols-[0fr] opacity-0 @2xl:grid-cols-[1fr] @2xl:opacity-100',
                    )}
                  >
                    <span className="overflow-hidden whitespace-nowrap pl-1.5">
                      {ligado ? file.name : file.label}
                    </span>
                  </span>
                </button>
              )
            })}
            {/* O fio da aba aberta, como nos editores: um so, que desliza ate a aba nova. */}
            {fio.lugar && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-0 h-0.5 bg-code-name transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                style={{ transform: `translateX(${fio.lugar.x}px)`, width: fio.lugar.largura }}
              />
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2 font-mono text-caption text-code-muted">
            {aberto.icon}
            <span className="truncate">{aberto.name}</span>
          </div>
        )}
        {/* Com linhas novas, o copiar leva so elas: quem acrescenta ao que ja tem nao cola
            o trecho inteiro de novo por engano. */}
        {aberto.added?.length ? (
          <Copiar valor={linhasNovas(aberto.code, aberto.added)} rotulo="Copiar as linhas novas" />
        ) : (
          <Copiar valor={aberto.code} />
        )}
      </div>

      {/* A altura acompanha o codigo novo, deslizando: o Python tem mais linhas que o Node,
          e o editor pulava de tamanho na troca. */}
      <div
        className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ height: altura.valor ?? undefined }}
      >
        <div ref={altura.conteudo}>
          <Codigo
            key={aberto.id}
            id={`${ids}-codigo`}
            code={aberto.code}
            language={aberto.language}
            added={aberto.added}
            rotulo={aberto.name}
            painel={abas}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Onde fica o fio da aba aberta: a posicao e a largura dela, medidas de novo a cada troca e
 * enquanto as abas mudam de largura (o nome abrindo e fechando), para o fio acompanhar.
 */
function useFioDaAba(abertoId: string | undefined) {
  const lista = useRef<HTMLDivElement>(null)
  const [lugar, setLugar] = useState<{ x: number; largura: number } | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: a aba aberta e o gatilho de medir de novo
  useLayoutEffect(() => {
    const elemento = lista.current
    if (!elemento) return

    const medir = () => {
      const aba = elemento.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      if (!aba) return
      setLugar({ x: aba.offsetLeft, largura: aba.offsetWidth })
      // A aberta sempre a vista na fileira: no celular cabem duas ou tres abas, e a aberta
      // podia ficar escondida a direita. So a fileira rola, nunca a pagina; e a medida se
      // repete enquanto o nome dela abre, para a aba inteira caber.
      const fim = aba.offsetLeft + aba.offsetWidth
      if (aba.offsetLeft < elemento.scrollLeft) elemento.scrollLeft = aba.offsetLeft
      else if (fim > elemento.scrollLeft + elemento.clientWidth)
        elemento.scrollLeft = fim - elemento.clientWidth
    }
    medir()

    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(medir)
    for (const aba of elemento.querySelectorAll('[role="tab"]')) observador.observe(aba)
    return () => observador.disconnect()
  }, [abertoId])

  return { lista, lugar }
}

/**
 * A altura do conteudo, medida sempre que ele muda: quem embrulha usa como altura fixa e
 * desliza de uma para a outra. Antes da primeira medida, a altura e a natural.
 */
function useAlturaQueAcompanha() {
  const conteudo = useRef<HTMLDivElement>(null)
  const [valor, setValor] = useState<number | null>(null)

  useLayoutEffect(() => {
    const elemento = conteudo.current
    if (!elemento || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(() => setValor(elemento.offsetHeight))
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  return { conteudo, valor }
}

/**
 * O codigo com numero de linha. Entra esmaecendo e subindo um pouco, ao trocar de aba.
 * Com linhas novas, elas trocam o numero pelo "+" numa faixa da margem, e as que ja
 * existiam ficam na cor apagada, sem a sintaxe.
 */
function Codigo({
  id,
  code,
  language,
  added,
  rotulo,
  painel,
}: {
  id: string
  code: string
  language: CodeLanguage
  added?: readonly number[]
  rotulo: string
  painel: boolean
}) {
  const linhas = linhasDe(code, language)
  const novas = new Set(added)
  const classe = 'animate-code-in overflow-x-auto py-3 focus-visible:-outline-offset-2'
  // Rola de lado so quando algum codigo fica escondido: os 16 px da folga a direita de
  // cada linha (`pr-4`) passando da largura nao abrem barra.
  const area = useRef<HTMLDivElement>(null)
  useScrollOnlyForContent(area, 16)
  const conteudo = (
    <pre className="m-0 min-w-max font-mono text-caption leading-6">
      {linhas.map((linha, indice) => {
        const nova = novas.has(indice + 1)
        const apagada = novas.size > 0 && !nova
        return (
          // A linha e a posicao dela: o codigo nao muda de ordem dentro do mesmo arquivo.
          // biome-ignore lint/suspicious/noArrayIndexKey: a posicao e a identidade da linha
          <div key={indice} className="flex">
            <span
              aria-hidden="true"
              className={cn(
                'w-8 flex-none select-none pr-2 text-right tabular-nums',
                nova ? 'bg-code-added font-semibold text-code-added-fg' : 'text-code-muted',
              )}
            >
              {nova ? '+' : indice + 1}
            </span>
            <code className={cn('pr-4 pl-2', apagada && 'text-code-muted')}>
              {nova && <span className="sr-only select-none">Linha nova: </span>}
              {linha.length === 0
                ? ' '
                : linha.map((pedaco, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: os pedacos de uma linha nao mudam de ordem
                    <span key={i} className={apagada ? undefined : COR[pedaco.kind]}>
                      {pedaco.text}
                    </span>
                  ))}
            </code>
          </div>
        )
      })}
    </pre>
  )

  // A area rola de lado com o teclado tambem: por isso a parada de Tab. Nas abas, ela e o
  // painel da aba aberta; sozinha, uma regiao com o nome do arquivo.
  return painel ? (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: o painel da aba recebe o foco, como pede o padrao de abas, para rolar de lado pelas setas
    <div ref={area} id={id} role="tabpanel" aria-label={rotulo} tabIndex={0} className={classe}>
      {conteudo}
    </div>
  ) : (
    <section ref={area} id={id} aria-label={rotulo} tabIndex={-1} className={classe}>
      {conteudo}
    </section>
  )
}

/** Os pedacos do realce, cortados nas quebras de linha: cada linha ganha o seu numero. */
function linhasDe(code: string, language: CodeLanguage) {
  const linhas: { text: string; kind: TokenKind }[][] = [[]]
  for (const pedaco of highlight(code, language)) {
    const partes = pedaco.text.split('\n')
    partes.forEach((parte, indice) => {
      if (indice > 0) linhas.push([])
      if (parte.length > 0) linhas.at(-1)?.push({ text: parte, kind: pedaco.kind })
    })
  }
  return linhas
}

/**
 * O "+" da linha nova, para o texto ao lado do editor apontar para ele com o mesmo
 * desenho da margem.
 */
export function CodeAddedMark() {
  return (
    <span className="inline-block rounded bg-code-added px-1 font-mono font-semibold text-code-added-fg leading-tight">
      +
    </span>
  )
}

/** So as linhas novas do codigo (contando de 1), na ordem, para o copiar levar. */
function linhasNovas(code: string, added: readonly number[]) {
  const novas = new Set(added)
  return code
    .split('\n')
    .filter((_, indice) => novas.has(indice + 1))
    .join('\n')
}

/** O copiar da barra do editor: o desenho, e "Copiado" por um instante depois. */
function Copiar({ valor, rotulo = 'Copiar' }: { valor: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false)
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(relogio.current), [])

  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await copyText(valor))) return
        setCopiado(true)
        clearTimeout(relogio.current)
        relogio.current = setTimeout(() => setCopiado(false), 1800)
      }}
      className="flex flex-none items-center gap-1.5 border-code-border border-l px-3 text-caption text-code-muted transition-colors duration-150 hover:text-code-fg focus-visible:-outline-offset-2"
    >
      <svg
        viewBox="0 0 16 16"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {copiado ? (
          <path d="m3.5 8.5 3 3 6-7" />
        ) : (
          <>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" />
          </>
        )}
      </svg>
      {/* Com o editor estreito (passos aninhados no celular), so o desenho: o rotulo
          comprido cobria o nome do arquivo. O leitor de tela continua ouvindo o nome. */}
      <span aria-live="polite" className="@max-xs:sr-only">
        {copiado ? 'Copiado' : rotulo}
      </span>
    </button>
  )
}
