import { cn } from '@/shared/lib/cn'

/**
 * Verde e ativo, cinza e arquivado. **Nunca aparece sozinho**: vem sempre com o
 * nome do projeto e, quando arquivado, com a palavra "arquivado" ao lado — cor
 * sozinha nao informa.
 */
export function StatusDot({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        active ? 'bg-active' : 'bg-muted-dot',
        className,
      )}
      aria-hidden
    />
  )
}
