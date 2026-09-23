import { type PointerEvent, useMemo, useRef, useState } from 'react'
import { cropToFile, type Rect, toSourceRect } from '@/embed/screenCapture'

/** Menor recorte que conta como recorte, em pixels da tela do quadro. Menos que isso e clique. */
const MIN_SELECAO = 12

/**
 * Escolher um pedaco da captura.
 *
 * **O quadro cresce para isto, e volta depois.** Em 360 por 520 a tela inteira
 * caberia do tamanho de um selo, e escolher um botao dentro dela seria adivinhar.
 *
 * **Arrasta-se sobre uma imagem reduzida, e corta-se na original.** O print que
 * sobe tem a resolucao da tela capturada, e nao a do quadro.
 *
 * **"Usar a tela inteira" e o caminho sem mouse.** Arrastar nao funciona pelo
 * teclado; sem essa saida, quem navega por teclado capturaria e nao conseguiria
 * anexar.
 */
export function CaptureCropper({
  canvas,
  onUse,
  onCancel,
}: {
  canvas: HTMLCanvasElement
  onUse: (file: File) => void
  onCancel: () => void
}) {
  // JPEG leve so para mostrar: o corte usa o canvas original, e nao esta imagem.
  const previa = useMemo(() => canvas.toDataURL('image/jpeg', 0.7), [canvas])

  const imagem = useRef<HTMLImageElement>(null)
  const [inicio, setInicio] = useState<{ x: number; y: number } | null>(null)
  const [selecao, setSelecao] = useState<Rect | null>(null)
  const [gerando, setGerando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  function ponto(evento: PointerEvent) {
    const caixa = imagem.current?.getBoundingClientRect()
    if (!caixa) return { x: 0, y: 0 }

    return {
      x: Math.min(Math.max(0, evento.clientX - caixa.left), caixa.width),
      y: Math.min(Math.max(0, evento.clientY - caixa.top), caixa.height),
    }
  }

  const valida =
    selecao !== null &&
    Math.abs(selecao.width) >= MIN_SELECAO &&
    Math.abs(selecao.height) >= MIN_SELECAO

  async function usar(recorte: Rect | null) {
    const img = imagem.current
    if (!img || gerando) return

    setGerando(true)
    setFalha(null)

    try {
      const original = { width: canvas.width, height: canvas.height }
      const pedaco = recorte
        ? toSourceRect(recorte, { width: img.clientWidth, height: img.clientHeight }, original)
        : { x: 0, y: 0, ...original }

      onUse(await cropToFile(canvas, pedaco))
    } catch (erro) {
      setFalha(erro instanceof Error ? erro.message : 'Não deu para gerar a imagem.')
      setGerando(false)
    }
  }

  // Normaliza para desenhar: arrastar para a esquerda ou para cima da largura negativa.
  const caixa = selecao && {
    left: Math.min(selecao.x, selecao.x + selecao.width),
    top: Math.min(selecao.y, selecao.y + selecao.height),
    width: Math.abs(selecao.width),
    height: Math.abs(selecao.height),
  }

  return (
    <section className="flex h-full flex-col gap-3 bg-surface p-4">
      <div>
        <h2 className="font-semibold text-fg text-lead tracking-tight">Escolha o pedaço</h2>
        <p className="text-detail text-fg-muted leading-normal">
          Arraste sobre a imagem para marcar o que importa. Só o pedaço marcado vai junto do relato.
        </p>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-surface-sunken">
        {/* O ponteiro e capturado na imagem: arrastar ate fora dela continua valendo. */}
        <div
          className="relative inline-block cursor-crosshair touch-none select-none"
          onPointerDown={(evento) => {
            evento.currentTarget.setPointerCapture(evento.pointerId)
            const p = ponto(evento)
            setInicio(p)
            setSelecao({ x: p.x, y: p.y, width: 0, height: 0 })
          }}
          onPointerMove={(evento) => {
            if (!inicio) return
            const p = ponto(evento)
            setSelecao({ x: inicio.x, y: inicio.y, width: p.x - inicio.x, height: p.y - inicio.y })
          }}
          onPointerUp={() => setInicio(null)}
        >
          <img
            ref={imagem}
            src={previa}
            alt="A tela capturada"
            draggable={false}
            className="block max-w-full"
          />
          {caixa && valida && (
            <div
              aria-hidden
              className="pointer-events-none absolute border-2 border-[var(--widget-accent)] bg-[var(--widget-accent)]/10"
              style={caixa}
            />
          )}
        </div>
      </div>

      {falha && (
        <p role="alert" className="text-detail text-error-fg">
          {falha}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!valida || gerando}
          onClick={() => void usar(selecao)}
          className="h-9 rounded-lg bg-[var(--widget-accent)] px-4 font-medium text-[var(--widget-ink)] text-body enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-disabled"
        >
          Usar o recorte
        </button>
        <button
          type="button"
          disabled={gerando}
          onClick={() => void usar(null)}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-body text-fg enabled:hover:bg-surface-sunken"
        >
          Usar a tela inteira
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto h-9 px-2 text-detail text-fg-muted underline underline-offset-4"
        >
          Cancelar
        </button>
      </div>
    </section>
  )
}
