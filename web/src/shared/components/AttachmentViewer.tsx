import * as Dialog from '@radix-ui/react-dialog'
import {
  type ComponentType,
  createContext,
  type KeyboardEvent,
  lazy,
  type RefObject,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { GalleryItem } from '@/shared/components/AttachmentGallery'
import { cn } from '@/shared/lib/cn'
import { fileTypeBadge, fileTypeLabel } from '@/shared/lib/fileFormats'
import {
  type Aba,
  type BlocoDoDocumento,
  lerPrevia,
  nomeParaBaixar,
  type Previa,
  type Trecho,
} from '@/shared/lib/filePreview'
import { formatBytes } from '@/shared/lib/formatBytes'

const PdfPages = lazy(() => import('@/shared/components/PdfPages'))

/** Antecedencia com que o endereco ja conta como vencido, a mesma da galeria. */
const RENOVAR_ANTES_MS = 30_000

const AVISO_VENCIDO = 'O endereço tinha vencido, então tente baixar de novo em alguns segundos.'

/** O que se le de um arquivo, guardado enquanto o visualizador estiver aberto. */
interface Lido {
  bytes: Uint8Array
  previa: Previa
}

type Leitura =
  | { id: string; url: string; fase: 'abrindo' }
  | { id: string; url: string; fase: 'falhou' }
  | ({ id: string; url: string; fase: 'pronto' } & Lido)

/**
 * O texto de um arquivo na tela: no painel, o nome e o tamanho; do lado de fora, o tipo
 * e o tamanho. O nome original nunca sai para fora.
 */
export function textoDoArquivo(item: GalleryItem): string {
  return (
    item.caption ??
    [
      fileTypeLabel(item.contentType),
      item.sizeBytes !== undefined ? formatBytes(item.sizeBytes) : null,
    ]
      .filter(Boolean)
      .join(', ')
  )
}

/**
 * O card do painel abriga o visualizador **dentro dele**: quem prove este contexto diz
 * como o Esc do card fecha so o anexo. Sem ele (a pagina de acompanhamento, o
 * formulario), o visualizador abre por cima da tela.
 */
export interface VisualizadorNoCard {
  /** Registra o Esc no card: com o foco no anexo aberto, o Esc fecha o anexo, e o card fica. */
  EscDoCard: ComponentType<{ area: RefObject<HTMLElement | null>; cancelar: () => void }>
}

export const VisualizadorNoCardContext = createContext<VisualizadorNoCard | null>(null)

/**
 * Os anexos abertos **por cima da tela, sem sair dela**: a imagem em tamanho grande, e o
 * arquivo lido ali mesmo, seja PDF, texto, planilha ou documento.
 *
 * **Antes, o clique abria outra aba.** Quem estava no meio de um card, ou escrevendo uma
 * resposta, saia da ferramenta para ver um print. Agora o visualizador abre por cima, o
 * Esc fecha, e as setas passam de um anexo para o outro.
 *
 * **O arquivo continua so para baixar no armazenamento.** O endereco assinado manda o
 * navegador salvar, e nunca abrir como pagina; o visualizador busca os bytes e os
 * desenha como texto e canvas (`filePreview`, `PdfPages`). Nada de dentro do arquivo
 * roda, e o formato que nao tem previa diz isso e oferece o "Baixar".
 *
 * **Endereco vencido pede outro.** Os enderecos vencem em minutos: o arquivo que nao
 * abre pede um endereco novo a galeria uma vez, e tenta de novo sozinho quando ele chega.
 */
export function AttachmentViewer({
  items,
  aberto,
  onAbrir,
  onFechar,
  onExpired,
}: {
  /** Imagens e arquivos, na ordem da tela. */
  items: GalleryItem[]
  /** A posicao do aberto, ou nulo com o visualizador fechado. */
  aberto: number | null
  onAbrir: (indice: number) => void
  onFechar: () => void
  onExpired: () => void
}) {
  const atual = aberto === null ? null : (items[aberto] ?? null)
  // Ao fechar, a caixa ainda anima a saida: segue mostrando o ultimo, em vez de piscar vazia.
  const ultimo = useRef<GalleryItem | null>(null)
  if (atual) ultimo.current = atual
  const item = atual ?? ultimo.current
  const indice = item ? items.findIndex((i) => i.id === item.id) : -1

  const { leitura, tentarDeNovo } = useLeitura(
    atual && atual.kind !== 'Image' ? atual : null,
    onExpired,
  )
  const [aviso, setAviso] = useState<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: o aviso vale para o anexo em que apareceu
  useEffect(() => setAviso(null), [item?.id])

  const ir = (passo: number) => {
    if (items.length < 2 || indice < 0) return
    onAbrir((indice + passo + items.length) % items.length)
  }

  async function baixar() {
    if (!item) return
    const vencendo = Date.parse(item.expiresAt) - Date.now() < RENOVAR_ANTES_MS
    if (item.kind !== 'Image') {
      // O arquivo baixa pelo endereco assinado: a API manda salvar, com o nome que ela
      // mesma limpou. Vencendo, pede um novo em vez de abrir o erro do armazenamento.
      if (vencendo) {
        setAviso(AVISO_VENCIDO)
        onExpired()
        return
      }
      const link = document.createElement('a')
      link.href = item.url
      link.download = ''
      // Em outra aba so se algo der errado: com o anexo na assinatura, o navegador salva e
      // fica aqui. `noreferrer` nao deixa a aba alcancar esta pagina.
      link.target = '_blank'
      link.rel = 'noreferrer'
      document.body.append(link)
      link.click()
      link.remove()
      return
    }
    try {
      salvar(await buscar(item.url), nomeParaBaixar(item.fileName, item.contentType))
    } catch {
      setAviso(AVISO_VENCIDO)
      onExpired()
    }
  }

  const ehImagem = item?.kind === 'Image'
  // A planilha rola por dentro, com as abas presas embaixo: o corpo nao rola nem reserva
  // lugar de barra, que deixaria um vao a direita das abas.
  const rolaPorDentro =
    !ehImagem && leitura?.fase === 'pronto' && leitura.previa.tipo === 'planilha'
  const titulo = item ? (ehImagem ? 'Imagem anexada' : textoDoArquivo(item)) : ''

  const noCard = useContext(VisualizadorNoCardContext)
  const area = useRef<HTMLElement>(null)
  // Quem abriu, para o foco voltar a ele ao fechar no card. No modal por cima, o Radix
  // ja devolve o foco sozinho.
  const quemAbriu = useRef<Element | null>(null)
  const estavaAberto = useRef(false)
  if (atual && !estavaAberto.current) quemAbriu.current = document.activeElement
  estavaAberto.current = atual !== null
  useEffect(() => {
    if (atual !== null || !noCard) return
    const voltar = quemAbriu.current
    if (voltar instanceof HTMLElement && voltar.isConnected) voltar.focus({ preventScroll: true })
  }, [atual, noCard])

  const setas = (evento: KeyboardEvent) => {
    // As setas passam de imagem em imagem. No arquivo, elas rolam a tabela e o texto.
    if (!ehImagem) return
    if (evento.key === 'ArrowRight') ir(1)
    else if (evento.key === 'ArrowLeft') ir(-1)
  }

  const selo = item && !ehImagem && (
    <span
      aria-hidden="true"
      className="flex h-7 min-w-9 flex-none items-center justify-center rounded-md bg-surface-sunken px-1 font-medium text-caption text-fg-muted"
    >
      {fileTypeBadge(item.contentType)}
    </span>
  )
  const classeDoTitulo = cn(
    'min-w-0 flex-1 truncate text-detail text-fg',
    // A imagem nao mostra nome: o titulo fica so para o leitor de tela.
    ehImagem && 'sr-only',
  )
  const acoes = (
    <>
      {ehImagem && <span className="flex-1" />}
      {items.length > 1 && (
        <div className="flex flex-none items-center gap-0.5">
          <BotaoDoTopo rotulo="Anexo anterior" onClick={() => ir(-1)}>
            <Seta para="esquerda" />
          </BotaoDoTopo>
          <span
            aria-live="polite"
            className="min-w-12 text-center text-caption text-fg-muted tabular-nums"
          >
            {indice + 1} de {items.length}
          </span>
          <BotaoDoTopo rotulo="Próximo anexo" onClick={() => ir(1)}>
            <Seta para="direita" />
          </BotaoDoTopo>
        </div>
      )}
      <button
        type="button"
        onClick={baixar}
        className="flex h-8 flex-none items-center gap-1.5 rounded-lg px-2.5 font-medium text-detail text-fg transition-colors hover:bg-surface-sunken pointer-coarse:h-10"
      >
        <IconeBaixar />
        {/* No celular, so o icone: o nome do arquivo precisa do espaco. */}
        <span className="max-sm:sr-only">Baixar</span>
      </button>
    </>
  )
  const corpo = (
    <>
      {aviso && (
        <p
          role="status"
          className="flex-none border-border border-b bg-surface px-4 py-2 text-caption text-fg-muted"
        >
          {aviso}
        </p>
      )}

      {/* A barra de rolagem encosta na borda, com o lugar reservado: trocar de anexo nao pula. */}
      <div
        className={cn(
          'min-h-0 flex-1 overscroll-contain bg-surface-sunken',
          rolaPorDentro ? 'overflow-hidden' : 'overflow-auto [scrollbar-gutter:stable]',
        )}
      >
        {item && (
          <div key={item.id} className="h-full animate-veil-in">
            {ehImagem ? (
              <ImagemGrande item={item} onExpired={onExpired} />
            ) : (
              <ArquivoLido leitura={leitura} onBaixar={baixar} onTentarDeNovo={tentarDeNovo} />
            )}
          </div>
        )}
      </div>
    </>
  )

  // **No card do painel, o anexo abre no proprio card**, cobrindo o corpo dele como a
  // conversa expandida, e nao num segundo modal por cima. O topo do card (o titulo, as
  // setas entre cards e o X) continua a vista; o "Voltar ao relato" e o Esc devolvem o
  // card como estava.
  if (noCard) {
    if (!atual || !item) return null
    return (
      <section
        ref={area}
        aria-label={titulo}
        onKeyDown={setas}
        className="absolute inset-0 z-cover flex animate-fade-in flex-col bg-surface-raised"
      >
        <noCard.EscDoCard area={area} cancelar={onFechar} />
        <div className="flex flex-none items-center gap-2 border-border border-b py-2 pr-3 pl-2 sm:pl-3">
          <button
            type="button"
            // biome-ignore lint/a11y/noAutofocus: o anexo cobre o card, e o foco precisa estar nele para o Esc fechar so o anexo
            autoFocus
            aria-label="Voltar ao relato"
            onClick={onFechar}
            className="flex h-8 flex-none items-center gap-1.5 rounded-lg px-2 text-detail text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg pointer-coarse:h-10"
          >
            <Seta para="esquerda" />
            <span aria-hidden="true" className="max-sm:hidden">
              Voltar ao relato
            </span>
            <span aria-hidden="true" className="sm:hidden">
              Voltar
            </span>
          </button>
          <span aria-hidden="true" className="h-5 w-px flex-none bg-border" />
          {selo}
          <h2 title={titulo} className={classeDoTitulo}>
            {titulo}
          </h2>
          {acoes}
        </div>
        {corpo}
      </section>
    )
  }

  return (
    <Dialog.Root open={atual !== null} onOpenChange={(aberta) => !aberta && onFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-veil bg-overlay data-[state=closed]:animate-veil-out data-[state=open]:animate-veil-in" />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={setas}
          className={cn(
            '-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-dialog flex flex-col overflow-hidden bg-surface-raised data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in',
            'h-dvh w-screen sm:h-[calc(100dvh-2rem)] sm:w-[min(72rem,calc(100vw-2rem))] sm:rounded-xl sm:border sm:border-border',
          )}
        >
          <div className="flex flex-none items-center gap-2 border-border border-b py-2 pr-2 pl-4">
            {selo}
            <Dialog.Title title={titulo} className={classeDoTitulo}>
              {titulo}
            </Dialog.Title>
            {acoes}
            <Dialog.Close
              aria-label="Fechar"
              className="flex size-8 flex-none items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg pointer-coarse:size-10"
            >
              <svg
                viewBox="0 0 12 12"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </Dialog.Close>
          </div>
          {corpo}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * Busca e le o arquivo aberto. **Guarda o que ja leu** enquanto o visualizador estiver
 * montado: voltar a um arquivo pelas setas nao baixa de novo, e a renovacao dos enderecos
 * a cada poucos minutos nao relê o que ja esta na tela.
 */
function useLeitura(
  item: GalleryItem | null,
  onExpired: () => void,
): { leitura: Leitura | null; tentarDeNovo: () => void } {
  const [leitura, setLeitura] = useState<Leitura | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const lidos = useRef(new Map<string, Lido>())
  const pediuNovo = useRef(new Set<string>())
  const renovar = useRef(onExpired)
  renovar.current = onExpired

  const id = item?.id ?? null
  const url = item?.url ?? null
  const urlAtual = useRef(url)
  urlAtual.current = url
  const contentType = useRef(item?.contentType)
  contentType.current = item?.contentType

  // O que falhou, e o endereco mudou desde entao: a renovacao chegou, e tenta de novo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: so a chegada de endereco novo interessa aqui
  useEffect(() => {
    if (leitura?.fase === 'falhou' && leitura.id === id && url !== null && leitura.url !== url) {
      setTentativa((n) => n + 1)
    }
  }, [url])

  // Trocar de endereco com o arquivo ja lido nao le de novo: a busca so roda ao abrir
  // outro arquivo e a cada tentativa.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tentativa e o gatilho de ler de novo
  useEffect(() => {
    const endereco = urlAtual.current
    if (id === null || endereco === null) return
    const guardado = lidos.current.get(id)
    if (guardado) {
      setLeitura({ id, url: endereco, fase: 'pronto', ...guardado })
      return
    }
    const controle = new AbortController()
    setLeitura({ id, url: endereco, fase: 'abrindo' })
    buscar(endereco, controle.signal)
      .then(async (bytes) => {
        const lido = { bytes, previa: await lerPrevia(bytes, contentType.current) }
        lidos.current.set(id, lido)
        if (!controle.signal.aborted) setLeitura({ id, url: endereco, fase: 'pronto', ...lido })
      })
      .catch(() => {
        if (controle.signal.aborted) return
        setLeitura({ id, url: endereco, fase: 'falhou' })
        // O computador dormiu e o endereco venceu: pede um novo, uma vez por arquivo.
        if (!pediuNovo.current.has(id)) {
          pediuNovo.current.add(id)
          renovar.current()
        }
      })
    return () => controle.abort()
  }, [id, tentativa])

  const tentarDeNovo = () => setTentativa((n) => n + 1)
  if (id === null) return { leitura: null, tentarDeNovo }
  if (leitura === null || leitura.id !== id) {
    return { leitura: { id, url: url ?? '', fase: 'abrindo' }, tentarDeNovo }
  }
  return { leitura, tentarDeNovo }
}

async function buscar(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const resposta = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
  return new Uint8Array(await resposta.arrayBuffer())
}

/**
 * Salva a imagem com um nome. **Pelo endereco local do navegador (`blob:`), e nao pelo
 * do armazenamento**: o `download` so vale na propria origem, e a imagem, que o
 * armazenamento entrega para mostrar, abriria numa aba em vez de salvar.
 */
function salvar(bytes: Uint8Array, nome: string) {
  const endereco = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
  )
  const link = document.createElement('a')
  link.href = endereco
  link.download = nome
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(endereco), 10_000)
}

function ImagemGrande({ item, onExpired }: { item: GalleryItem; onExpired: () => void }) {
  const [falhouCom, setFalhouCom] = useState<string | null>(null)
  const quebrada = falhouCom === item.url

  if (quebrada) {
    return (
      <Centro>
        <p className="text-detail text-fg-muted">
          A imagem não carregou.{' '}
          <button
            type="button"
            onClick={() => setFalhouCom(null)}
            className="font-medium text-fg underline underline-offset-4"
          >
            Tentar de novo
          </button>
        </p>
      </Centro>
    )
  }

  return (
    <div className="flex h-full items-center justify-center p-3 sm:p-6">
      <img
        src={item.url}
        alt={item.caption ? `Imagem anexada: ${item.caption}` : 'Imagem anexada'}
        decoding="async"
        onError={() => {
          setFalhouCom(item.url)
          onExpired()
        }}
        className="max-h-full max-w-full rounded-md object-contain"
      />
    </div>
  )
}

function ArquivoLido({
  leitura,
  onBaixar,
  onTentarDeNovo,
}: {
  leitura: Leitura | null
  onBaixar: () => void
  onTentarDeNovo: () => void
}) {
  const [pdfFalhou, setPdfFalhou] = useState(false)

  if (leitura === null || leitura.fase === 'abrindo') {
    return (
      <Centro>
        <p className="animate-pulse text-detail text-fg-muted">Abrindo o arquivo</p>
      </Centro>
    )
  }

  if (leitura.fase === 'falhou') {
    return (
      <Centro>
        <p className="text-detail text-fg-muted">
          Não deu para abrir este arquivo agora.{' '}
          <button
            type="button"
            onClick={onTentarDeNovo}
            className="font-medium text-fg underline underline-offset-4"
          >
            Tentar de novo
          </button>
        </p>
      </Centro>
    )
  }

  const { previa } = leitura

  if (previa.tipo === 'sem-previa' || (previa.tipo === 'pdf' && pdfFalhou)) {
    return (
      <Centro>
        <p className="max-w-80 text-center text-detail text-fg-muted leading-relaxed">
          Este arquivo não abre aqui, mas você pode baixar e abrir no seu computador.
        </p>
        <button
          type="button"
          onClick={onBaixar}
          className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-body text-fg transition-colors hover:bg-surface-raised"
        >
          <IconeBaixar />
          Baixar
        </button>
      </Centro>
    )
  }

  if (previa.tipo === 'pdf') {
    return (
      <div className="mx-auto w-full max-w-[56rem] p-3 sm:p-6">
        <Suspense
          fallback={<p className="py-16 text-center text-detail text-fg-muted">Abrindo o PDF</p>}
        >
          <PdfPages bytes={leitura.bytes} onFalha={() => setPdfFalhou(true)} />
        </Suspense>
      </div>
    )
  }

  if (previa.tipo === 'texto') {
    return (
      <div className="p-3 sm:p-6">
        <pre className="mx-auto max-w-[72rem] whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-raised p-4 font-mono text-detail text-fg leading-relaxed">
          {previa.texto}
        </pre>
        {previa.cortado && <Cortado />}
      </div>
    )
  }

  if (previa.tipo === 'planilha') return <Planilha abas={previa.abas} />

  return (
    <div className="p-3 sm:p-6">
      <article className="mx-auto flex max-w-[46rem] flex-col gap-3 rounded-lg border border-border bg-surface-raised px-5 py-6 text-body text-fg leading-relaxed sm:px-10 sm:py-10">
        {previa.blocos.map((bloco, i) => (
          // A ordem dos blocos e a do documento, e ele nao muda enquanto esta aberto.
          // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa, lida uma vez
          <Bloco key={i} bloco={bloco} />
        ))}
        {previa.blocos.length === 0 && (
          <p className="text-center text-fg-muted">Este documento não tem texto.</p>
        )}
      </article>
      {previa.cortado && <Cortado />}
    </div>
  )
}

function Cortado() {
  return (
    <p className="mt-3 text-center text-caption text-fg-muted">
      Aqui aparece só o começo do arquivo, e o resto vem ao baixar.
    </p>
  )
}

function Trechos({ trechos }: { trechos: Trecho[] }) {
  return (
    <>
      {trechos.map((t, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: trechos fixos de um paragrafo lido uma vez
          key={i}
          className={cn('whitespace-pre-wrap', t.negrito && 'font-semibold', t.italico && 'italic')}
        >
          {t.texto}
        </span>
      ))}
    </>
  )
}

function Bloco({ bloco }: { bloco: BlocoDoDocumento }) {
  if (bloco.tipo === 'titulo') {
    // Abaixo do titulo do visualizador: o titulo do documento comeca no h3.
    const Titulo = bloco.nivel === 1 ? 'h3' : bloco.nivel === 2 ? 'h4' : 'h5'
    const tamanho = bloco.nivel === 1 ? 'text-lead' : 'text-body'
    return (
      <Titulo className={cn('mt-2 font-semibold', tamanho)}>
        <Trechos trechos={bloco.trechos} />
      </Titulo>
    )
  }
  if (bloco.tipo === 'tabela') return <Tabela linhas={bloco.linhas} />
  if (bloco.trechos.length === 0) return <div aria-hidden="true" className="h-2" />
  return (
    <p className={cn(bloco.item && 'flex gap-2')}>
      {bloco.item && <span aria-hidden="true">•</span>}
      <span>
        <Trechos trechos={bloco.trechos} />
      </span>
    </p>
  )
}

/**
 * Uma tabela lida do arquivo, numa moldura que abraca so a tabela. As celulas tem linha
 * so por dentro: a borda de fora e a da moldura, e nao dobra.
 */
function Tabela({ linhas, cabecalho = false }: { linhas: string[][]; cabecalho?: boolean }) {
  const colunas = Math.max(0, ...linhas.map((l) => l.length))
  return (
    <div className="inline-block max-w-full overflow-x-auto rounded-lg border border-border bg-surface-raised align-top">
      <table
        className={cn(
          'border-collapse text-detail',
          '[&_td:last-child]:border-r-0 [&_tr:last-child_td]:border-b-0',
          // Na planilha, a primeira linha costuma ser o nome das colunas.
          cabecalho && '[&_tr:first-child_td]:bg-surface [&_tr:first-child_td]:font-medium',
        )}
      >
        <tbody>
          {linhas.map((linha, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: linhas fixas, lidas uma vez
            <tr key={i}>
              {Array.from({ length: colunas }, (_, j) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: celulas fixas, lidas uma vez
                  key={j}
                  className="max-w-80 whitespace-pre-wrap break-words border-border border-r border-b px-2.5 py-1.5 align-top text-fg"
                >
                  {linha[j] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A planilha, com uma aba por vez e os botoes das abas embaixo, como no Excel. */
function Planilha({ abas }: { abas: Aba[] }) {
  const [ativa, setAtiva] = useState(0)
  const aba = abas[ativa] ?? abas[0]
  if (!aba) return null
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-3 [scrollbar-gutter:stable] sm:p-6">
        {aba.linhas.length === 0 ? (
          <p className="py-16 text-center text-detail text-fg-muted">Esta aba está vazia.</p>
        ) : (
          <Tabela linhas={aba.linhas} cabecalho />
        )}
        {aba.cortada && <Cortado />}
      </div>
      {abas.length > 1 && (
        <div
          role="tablist"
          aria-label="Abas da planilha"
          className="flex flex-none gap-1 overflow-x-auto border-border border-t bg-surface-raised px-3 py-2"
        >
          {abas.map((a, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: abas fixas, lidas uma vez
              key={i}
              type="button"
              role="tab"
              aria-selected={i === ativa}
              onClick={() => setAtiva(i)}
              className={cn(
                'h-8 flex-none rounded-md px-3 text-detail transition-colors',
                i === ativa
                  ? 'bg-surface-sunken font-medium text-fg'
                  : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
              )}
            >
              {a.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-60 flex-col items-center justify-center p-6">{children}</div>
  )
}

function BotaoDoTopo({
  rotulo,
  onClick,
  children,
}: {
  rotulo: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg pointer-coarse:size-10"
    >
      {children}
    </button>
  )
}

function Seta({ para }: { para: 'esquerda' | 'direita' }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={para === 'esquerda' ? 'M10 3.5L5.5 8l4.5 4.5' : 'M6 3.5L10.5 8 6 12.5'} />
    </svg>
  )
}

function IconeBaixar() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" />
    </svg>
  )
}
