import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * Mostra o bloco quando ele entra na tela, **uma vez so**: o efeito e de chegada,
 * e repetir a cada rolagem vira piscar. Por isso o observador desliga no primeiro
 * encontro.
 *
 * Envolva blocos, e nao itens de grade — o `div` daqui viraria a celula e
 * desmancharia o layout. Para escalonar, use varios com `delay` crescente.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const alvo = useRef<HTMLDivElement>(null)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const elemento = alvo.current
    if (!elemento) return

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada?.isIntersecting) return
        setVisivel(true)
        observador.disconnect()
      },
      // Um pouco antes da borda de baixo: colado nela o bloco so aparece quando
      // ja esta no meio da tela, e o efeito passa despercebido.
      { rootMargin: '0px 0px -12% 0px' },
    )

    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  return (
    <div
      ref={alvo}
      className={cn('reveal', visivel && 'reveal-on', className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}
