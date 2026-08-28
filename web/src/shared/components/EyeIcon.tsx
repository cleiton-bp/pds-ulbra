import { cn } from '@/shared/lib/cn'

/**
 * O olho de mostrar e esconder valor. Mesma grade de 12 e mesma espessura do
 * `LockIcon`, para os dois conviverem na mesma tela sem parecerem de familias
 * diferentes.
 *
 * `off` desenha o corte: quando o valor **ja esta a vista**, o botao passa a
 * oferecer esconder, e o icone precisa mostrar o que vai acontecer, nao o estado
 * em que se esta.
 */
export function EyeIcon({ off = false, className }: { off?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn('flex-none', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 6s1.9-3.4 5-3.4S11 6 11 6s-1.9 3.4-5 3.4S1 6 1 6Z" />
      <circle cx="6" cy="6" r="1.5" />
      {off && <path d="M2.2 9.8 9.8 2.2" />}
    </svg>
  )
}
