import { cn } from '@/shared/lib/cn'

/**
 * O cadeado do que ainda nao existe: menu lateral e terceiro passo de "Comece por
 * aqui". `currentColor` faz ele chegar apagado junto com o texto ao lado.
 */
export function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn('flex-none', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden
    >
      <rect x="2.2" y="5.2" width="7.6" height="5.6" rx="1.2" />
      <path d="M4 5.2V3.9a2 2 0 0 1 4 0v1.3" />
    </svg>
  )
}
