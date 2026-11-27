import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useRef, useState } from 'react'

// O worker do pdf.js sai do proprio painel (ou do quadro), e nao de uma CDN: o CSP so
// deixa rodar script da propria origem.
GlobalWorkerOptions.workerSrc = workerUrl

/** Paginas desenhadas. O resto vem no "Baixar". */
const PAGINAS_MAXIMAS = 300

/**
 * O PDF anexado, pagina por pagina, na largura do visualizador.
 *
 * **Desenhado pelo pdf.js, e nao pelo leitor do navegador.** O leitor embutido nao
 * existe no Chrome do Android, e no Safari do iPhone mostra so a primeira pagina; e
 * abri-lo pediria o arquivo como pagina, o que o endereco assinado para baixar recusa
 * de proposito. O pdf.js le os bytes e desenha cada pagina num canvas: nenhum script
 * do PDF roda.
 *
 * **Cada pagina so desenha quando chega perto da tela.** Um manual de 200 paginas nao
 * vira 200 canvas de uma vez.
 *
 * Este arquivo so carrega quando alguem abre um PDF: o pdf.js pesa, e quem nunca abre
 * um nao baixa nada dele.
 */
export default function PdfPages({
  bytes,
  onFalha,
}: {
  bytes: Uint8Array
  /** O PDF nao abriu: o visualizador mostra o "Baixar" no lugar. */
  onFalha: () => void
}) {
  const [documento, setDocumento] = useState<PDFDocumentProxy | null>(null)
  const falha = useRef(onFalha)
  falha.current = onFalha

  useEffect(() => {
    // Uma copia: o pdf.js entrega os bytes ao worker, e o original ficaria vazio para
    // o "Baixar".
    const tarefa = getDocument({ data: bytes.slice(), disableWorkerRendering: true })
    // **Cancelar nao e falhar.** Desmontar destroi a leitura em curso, e o pdf.js responde
    // rejeitando a promessa: sem esta trava, o painel (que no desenvolvimento monta cada
    // tela duas vezes) mostrava "nao abre aqui" para todo PDF.
    let vivo = true
    tarefa.promise.then(
      (lido) => {
        if (vivo) setDocumento(lido)
      },
      () => {
        if (vivo) falha.current()
      },
    )
    return () => {
      vivo = false
      setDocumento(null)
      void tarefa.destroy()
    }
  }, [bytes])

  if (documento === null) {
    return <p className="py-16 text-center text-detail text-fg-muted">Abrindo o PDF</p>
  }

  const total = Math.min(documento.numPages, PAGINAS_MAXIMAS)

  return (
    <div className="flex flex-col items-center gap-3">
      {Array.from({ length: total }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a posicao e o numero da pagina, que nao muda
        <Pagina key={i} documento={documento} numero={i + 1} total={documento.numPages} />
      ))}
      {documento.numPages > total && (
        <p className="py-2 text-center text-caption text-fg-muted">
          Aqui aparecem as primeiras {total} páginas, e o resto vem ao baixar.
        </p>
      )}
    </div>
  )
}

function Pagina({
  documento,
  numero,
  total,
}: {
  documento: PDFDocumentProxy
  numero: number
  total: number
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const tela = useRef<HTMLCanvasElement>(null)
  const [visivel, setVisivel] = useState(numero <= 2)
  // Altura sobre largura. Comeca na do A4 (raiz de 2), e acerta quando a pagina chega.
  const [proporcao, setProporcao] = useState(Math.SQRT2)

  useEffect(() => {
    if (visivel || !caixa.current) return
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) setVisivel(true)
      },
      { rootMargin: '800px 0px' },
    )
    observador.observe(caixa.current)
    return () => observador.disconnect()
  }, [visivel])

  useEffect(() => {
    if (!visivel) return
    let vivo = true
    let desenho: RenderTask | null = null
    documento.getPage(numero).then((pagina) => {
      const canvas = tela.current
      if (!vivo || !canvas) return
      const base = pagina.getViewport({ scale: 1 })
      setProporcao(base.height / base.width)
      const largura = caixa.current?.clientWidth || base.width
      // Nitida na tela de alta densidade, sem passar de 2x: um canvas de 4x numa pagina
      // grande come memoria do celular sem ganho que se veja.
      const escala = (largura / base.width) * Math.min(window.devicePixelRatio || 1, 2)
      const area = pagina.getViewport({ scale: escala })
      canvas.width = Math.floor(area.width)
      canvas.height = Math.floor(area.height)
      desenho = pagina.render({ canvas, viewport: area })
      desenho.promise.catch(() => {})
    })
    return () => {
      vivo = false
      desenho?.cancel()
    }
  }, [visivel, documento, numero])

  return (
    <div
      ref={caixa}
      style={{ aspectRatio: `1 / ${proporcao}` }}
      className="w-full overflow-hidden rounded-md border border-border bg-surface-raised"
    >
      <canvas
        ref={tela}
        role="img"
        aria-label={`Página ${numero} de ${total}`}
        className="block h-full w-full"
      />
    </div>
  )
}
