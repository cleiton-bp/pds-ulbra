/**
 * Mesmo desenho de `public/favicon.svg` — marca que muda de forma entre a aba e o
 * cabecalho parece dois produtos. `currentColor` faz o traco inverter no tema
 * escuro sem regra propria.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 400"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="18"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="PDS"
    >
      <path d="M42 12 H434 A30 30 0 0 1 464 42 V130 A30 30 0 0 0 464 190 V325 A30 30 0 0 1 434 355 H85 L12 390 V42 A30 30 0 0 1 42 12 Z" />
      <path d="M80 102 H305" />
      <path d="M80 162 H200" />
      <path d="M95 263 H363" strokeWidth="10" />
      <circle cx="95" cy="263" r="22" fill="currentColor" stroke="none" />
      <circle cx="243" cy="263" r="22" fill="currentColor" stroke="none" />
      <circle cx="380" cy="263" r="17" strokeWidth="11" />
    </svg>
  )
}
