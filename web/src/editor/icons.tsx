import type { ReactNode } from 'react'

/** As ferramentas do editor. Ver `TOOLS` em `ImageEditor`. */
export type Tool =
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'pen'
  | 'highlight'
  | 'text'
  | 'step'
  | 'blur'
  | 'hide'
  | 'crop'

/** Os desenhos dos botoes. Em `currentColor`: seguem o tema e o estado do botao. */
const DESENHOS: Record<Tool | 'undo' | 'redo', ReactNode> = {
  arrow: (
    <>
      <path d="M4 16 15 5" />
      <path d="M8.5 5H15v6.5" />
    </>
  ),
  rect: <rect x="3" y="5" width="14" height="10" rx="1" />,
  ellipse: <ellipse cx="10" cy="10" rx="7.5" ry="5.5" />,
  pen: <path d="M3 13.5c2-4.5 3.8-5.2 5.3-1.8 1.4 3.2 3.2 3 4.6-.6 1.2-3 2.6-3.6 4.1-2" />,
  highlight: (
    <>
      <path d="m6 12.5 6.5-7.5 3 3-7.5 6.5H6z" />
      <path d="M4 17.5h12" strokeWidth="3" strokeOpacity="0.4" />
    </>
  ),
  text: <path d="M4.5 5h11M10 5v11" />,
  step: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M8.6 7.6 10.2 6.5v7" />
    </>
  ),
  blur: (
    <>
      <circle cx="6" cy="6" r="1.4" fill="currentColor" />
      <circle cx="10" cy="6" r="1.4" fill="currentColor" fillOpacity="0.6" />
      <circle cx="14" cy="6" r="1.4" fill="currentColor" fillOpacity="0.3" />
      <circle cx="6" cy="10" r="1.4" fill="currentColor" fillOpacity="0.6" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" fillOpacity="0.3" />
      <circle cx="14" cy="10" r="1.4" fill="currentColor" fillOpacity="0.6" />
      <circle cx="6" cy="14" r="1.4" fill="currentColor" fillOpacity="0.3" />
      <circle cx="10" cy="14" r="1.4" fill="currentColor" fillOpacity="0.6" />
      <circle cx="14" cy="14" r="1.4" fill="currentColor" />
    </>
  ),
  hide: (
    <>
      <rect x="3" y="7.5" width="14" height="5" rx="0.5" fill="currentColor" />
      <path d="M3 4.5h8M3 15.5h11" strokeOpacity="0.5" />
    </>
  ),
  crop: <path d="M6 2.5V14h11.5M2.5 6H14v11.5" />,
  undo: <path d="M7 4.5 3.5 8 7 11.5M3.5 8H12a4.5 4.5 0 0 1 0 9H9" />,
  redo: <path d="M13 4.5 16.5 8 13 11.5M16.5 8H8a4.5 4.5 0 0 0 0 9h3" />,
}

export function EditorIcon({ name }: { name: Tool | 'undo' | 'redo' }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {DESENHOS[name]}
    </svg>
  )
}
