import { Logo } from '@/shared/components/Logo'
import { cn } from '@/shared/lib/cn'

/**
 * O nome "PDS" e provisorio e aparece so aqui: a troca no dia em que o definitivo
 * sair e um arquivo, nao uma busca por todas as telas.
 *
 * Em `shared/` porque a tela de entrada tambem desenha a marca, e tela puxando de
 * `app/` inverte a direcao da camada.
 */
export function Brand({ className, size = 'sm' }: { className?: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-semibold text-fg tracking-tight',
        className,
      )}
    >
      <Logo className={size === 'lg' ? 'h-6 w-[29px]' : 'h-[18px] w-[22px]'} />
      <span className={size === 'lg' ? 'text-brand' : 'text-lead'}>PDS</span>
    </span>
  )
}
