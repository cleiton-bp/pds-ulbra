import { type MouseEvent, type PointerEvent, useRef, useState } from 'react'
import type { HostConnection } from '@/embed/hostBridge'
import { isNarrowViewport } from '@/embed/launcher'
import { cn } from '@/shared/lib/cn'

/**
 * Mover e ampliar o formulario na pagina do cliente. **So onde o carregador sabe**
 * (`HostConnection.canMove`) e fora do celular: no celular o formulario e a folha presa ao
 * pe da tela, e nao ha para onde arrastar.
 *
 * O arrasto e do topo do formulario. O ponteiro fica preso ao topo (`setPointerCapture`)
 * enquanto o botao esta apertado: o quadro anda junto, e sem a captura o ponteiro sairia
 * dele no primeiro movimento rapido. As coordenadas que vao para a pagina sao as da tela,
 * que nao mudam enquanto o quadro anda.
 */
export function useFrameMove(host: HostConnection | null | undefined) {
  const pode =
    host?.canMove === true &&
    typeof host.move === 'function' &&
    !isNarrowViewport(host.init?.viewport?.width)
  const [grande, setGrande] = useState(false)
  const arrastando = useRef<number | null>(null)

  function alternar() {
    if (!pode) return
    const proximo = !grande
    setGrande(proximo)
    host?.setLarge?.(proximo)
  }

  /** Nao comeca em botao, link ou campo: o "Fechar" e o ampliar continuam clicaveis. */
  function noControle(alvo: EventTarget | null): boolean {
    return alvo instanceof Element && alvo.closest('button, a, input, textarea, select') !== null
  }

  const handlers = pode
    ? {
        onPointerDown(evento: PointerEvent<HTMLElement>) {
          if (evento.button !== 0 || noControle(evento.target)) return
          evento.preventDefault()
          evento.currentTarget.setPointerCapture(evento.pointerId)
          arrastando.current = evento.pointerId
          host?.move?.('start', evento.screenX, evento.screenY)
        },
        onPointerMove(evento: PointerEvent<HTMLElement>) {
          if (arrastando.current !== evento.pointerId) return
          host?.move?.('move', evento.screenX, evento.screenY)
        },
        onPointerUp(evento: PointerEvent<HTMLElement>) {
          if (arrastando.current !== evento.pointerId) return
          arrastando.current = null
          host?.move?.('end', evento.screenX, evento.screenY)
        },
        onPointerCancel(evento: PointerEvent<HTMLElement>) {
          if (arrastando.current !== evento.pointerId) return
          arrastando.current = null
          host?.move?.('end', evento.screenX, evento.screenY)
        },
        // Dois cliques no topo ampliam ou voltam, como numa janela do sistema.
        onDoubleClick(evento: MouseEvent<HTMLElement>) {
          if (noControle(evento.target)) return
          alternar()
        },
      }
    : {}

  return {
    pode,
    grande,
    alternar,
    handlers,
    /** A classe do topo que arrasta: a mao aberta mostra que ele se move. */
    topoClassName: pode ? 'cursor-grab select-none active:cursor-grabbing' : undefined,
  }
}

/** O botao de ampliar e voltar ao normal, ao lado do "Fechar". */
export function FrameSizeButton({
  grande,
  onClick,
  className,
}: {
  grande: boolean
  onClick: () => void
  className?: string
}) {
  const rotulo = grande ? 'Voltar ao tamanho normal' : 'Ampliar o formulário'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-fg',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {grande ? (
          <>
            <path d="M4 14h6v6" />
            <path d="M20 10h-6V4" />
            <path d="M14 10l7-7" />
            <path d="M3 21l7-7" />
          </>
        ) : (
          <>
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </>
        )}
      </svg>
    </button>
  )
}
