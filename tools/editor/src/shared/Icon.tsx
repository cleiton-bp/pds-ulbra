/**
 * Os icones da tela, desenhados em traço, no lugar dos caracteres soltos (⌂ ☰ ▤),
 * que mudam de tamanho e de peso de uma fonte para outra e nao alinham com o texto.
 *
 * Todos no mesmo quadro de 16x16 e na cor do texto em volta (`currentColor`).
 * Ficam `aria-hidden`: quem nomeia o botao e o rotulo ou o `aria-label` dele.
 */

const PATHS = {
  home: 'M2.5 7.5 8 3l5.5 4.5M4 6.5V13h3v-3.5h2V13h3V6.5',
  files: 'M2.5 3h11v10h-11zM6 3v10',
  panel: 'M2.5 3h11v10h-11zM10 3v10',
  plus: 'M8 3v10M3 8h10',
  minus: 'M3 8h10',
  search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM10.6 10.6 14 14',
  fit: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10',
  target: 'M8 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  lock: 'M4.5 7.5h7v6h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2',
  pencil: 'M10.5 3 13 5.5 6 12.5H3.5V10zM9 4.5 11.5 7',
  note: 'M3 2.5h10v8l-3 3H3zM10 13.5v-3h3',
  chevronLeft: 'M10 3 5 8l5 5',
  chevronRight: 'M6 3l5 5-5 5',
  chevronsLeft: 'M8.5 3.5 4 8l4.5 4.5M12.5 3.5 8 8l4.5 4.5',
  chevronsRight: 'M7.5 3.5 12 8l-4.5 4.5M3.5 3.5 8 8l-4.5 4.5',
  chevronDown: 'M3.5 6 8 10.5 12.5 6',
  close: 'M4 4l8 8M12 4l-8 8',
  check: 'M3.5 8.5 6.5 11.5 12.5 4.5',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  help: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM6.2 6.3a1.9 1.9 0 0 1 3.7.6c0 1.3-1.9 1.6-1.9 2.8M8 11.6v.1',
} as const

export type IconName = keyof typeof PATHS

export default function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
