import { cn } from '@/shared/lib/cn'

/** Ocupa o lugar do conteudo enquanto ele carrega. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse-soft rounded bg-surface-strong', className)} aria-hidden />
  )
}
