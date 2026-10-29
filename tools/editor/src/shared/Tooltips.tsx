import { useEffect, useRef, useState } from 'react'

/** Quanto o mouse precisa parar para a dica aparecer: a do navegador espera ~1s. */
const DELAY_MS = 350

type Tip = { text: string; x: number; y: number; below: boolean }

/**
 * As dicas da tela, no desenho dela e rapidas: no lugar das do navegador, que
 * demoravam e vinham cruas. Usam o `title` que cada botao ja tem: ao passar o mouse,
 * o `title` sai do elemento (senao o navegador mostraria a dele tambem) e volta ao
 * sair. Nenhum componente precisa mudar para ganhar a dica.
 *
 * Monta uma vez, no topo da tela (ver `Shell`).
 */
export function TooltipHost() {
  const [tip, setTip] = useState<Tip | null>(null)
  const timer = useRef<number>(0)
  const current = useRef<{ element: HTMLElement; title: string } | null>(null)

  useEffect(() => {
    const restore = (): void => {
      window.clearTimeout(timer.current)
      if (current.current) {
        const { element, title } = current.current
        if (!element.getAttribute('title')) element.setAttribute('title', title)
        current.current = null
      }
      setTip(null)
    }

    const onOver = (event: PointerEvent): void => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>('[title]')
      if (!element || element === current.current?.element) return
      restore()
      const title = element.getAttribute('title') ?? ''
      if (!title.trim()) return
      element.removeAttribute('title')
      current.current = { element, title }
      timer.current = window.setTimeout(() => {
        const box = element.getBoundingClientRect()
        // Embaixo do elemento; perto do pe da tela, em cima.
        const below = box.bottom + 60 < window.innerHeight
        setTip({ text: title, x: box.left + box.width / 2, y: below ? box.bottom + 8 : box.top - 8, below })
      }, DELAY_MS)
    }

    const onOut = (event: PointerEvent): void => {
      const saved = current.current
      if (!saved) return
      const next = event.relatedTarget as Node | null
      if (next && saved.element.contains(next)) return
      restore()
    }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    // Clique e tecla escondem a dica: ela nao pode ficar por cima do que se abriu.
    document.addEventListener('pointerdown', restore)
    document.addEventListener('keydown', restore)
    window.addEventListener('blur', restore)
    return () => {
      restore()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerdown', restore)
      document.removeEventListener('keydown', restore)
      window.removeEventListener('blur', restore)
    }
  }, [])

  if (!tip) return null

  // A dica nao sai da tela: presa entre as margens.
  const left = Math.min(window.innerWidth - 12, Math.max(12, tip.x))
  return (
    <div
      className={`tooltip${tip.below ? '' : ' is-above'}`}
      role="tooltip"
      style={{ left, top: tip.y }}
    >
      {tip.text}
    </div>
  )
}
