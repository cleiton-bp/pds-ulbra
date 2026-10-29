import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import Icon from './Icon'

export type QuickFindItem = {
  id: string
  title: string
  /** Segunda linha, mais apagada: o nome no dominio, o codigo do caso de uso… */
  detail?: string
  /** Marca curta a direita: "nova", "alterada". */
  tag?: { text: string; tone: 'new' | 'changed' | 'text' }
}

/** Sem acento e em minusculas, para "midia" achar "mídia". */
const plain = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * A busca rapida do canvas (Ctrl+K ou ⌘K): digita parte do nome e Enter leva ate
 * ele. Com dezenas de tabelas na tela, procurar com os olhos e a parte lenta.
 */
export function QuickFind({
  items, placeholder, onPick, onClose,
}: { items: QuickFindItem[]; placeholder: string; onPick: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const found = useMemo(() => {
    const term = plain(query.trim())
    if (!term) return items
    return items.filter((item) => plain(`${item.title} ${item.detail ?? ''}`).includes(term))
  }, [items, query])

  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (item: QuickFindItem | undefined): void => {
    if (!item) return
    onPick(item.id)
    onClose()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(found.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      pick(found[active])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="quickfind" role="dialog" aria-label="buscar no desenho" onMouseDown={onClose}>
      <div className="quickfind__box" onMouseDown={(event) => event.stopPropagation()}>
        <div className="quickfind__field">
          <Icon name="search" />
          <input
            autoFocus
            value={query}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="quickfind__list" ref={listRef} role="listbox">
          {found.length === 0 && <li className="quickfind__empty">nada com esse nome</li>}
          {found.map((item, index) => (
            <li key={item.id} role="option" aria-selected={index === active}>
              <button
                className={`quickfind__item${index === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(item)}
              >
                <span className="quickfind__title">{item.title}</span>
                {item.detail && <span className="quickfind__detail">{item.detail}</span>}
                {item.tag && <span className={`tag tag--${item.tag.tone}`}>{item.tag.text}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Ctrl+K e ⌘K abrem a busca: fora de campo de texto, para nao roubar o atalho de quem digita. */
export function useQuickFindShortcut(open: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        open()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])
}
