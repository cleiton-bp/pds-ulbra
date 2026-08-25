import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * As variantes carregam significado, nao aparencia:
 *
 * - `primary` — a acao da tela, no acento. Uma por tela.
 * - `secondary` — acao possivel, com borda e preenchimento fraco.
 * - `ghost` — apoio, sem borda, nao compete com o conteudo.
 * - `quiet` — a recusa de um dialogo: borda sem preenchimento. Existe porque o
 *   fundo do dialogo ja e `surface-raised`, e o `secondary` desenharia um
 *   retangulo mais claro no meio do cartao.
 * - `warn` — acao sem desfazer, em ambar: gerar nova chave.
 *
 * **Nao existe variante vermelha**: aqui vermelho e campo invalido. Botao
 * vermelho para acao reversivel ensina a ignorar vermelho.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'warn'
type Size = 'md' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: Size
  block?: boolean
}

/**
 * Todo hover e `enabled:hover:`: `:hover` casa com botao desabilitado, e sem o
 * `enabled:` "Salvar" trocava de cor sob o mouse convidando para um clique que
 * nao ia acontecer.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-accent text-accent-fg font-medium enabled:hover:bg-accent-hover disabled:bg-surface-sunken',
  secondary:
    'border-border bg-surface text-fg enabled:hover:bg-surface-sunken disabled:bg-surface-sunken',
  ghost: 'border-transparent bg-transparent text-fg enabled:hover:bg-surface-sunken',
  quiet: 'border-border bg-transparent text-fg enabled:hover:bg-surface-sunken',
  warn: 'border-warn-border bg-warn-surface text-warn-fg font-medium enabled:hover:bg-warn-surface-hover disabled:border-border disabled:bg-surface-sunken',
}

/** As alturas sao as do design: 36px na acao, 32px no controle de barra. */
const SIZES: Record<Size, string> = {
  md: 'h-9 px-3.5 text-body gap-2',
  sm: 'h-8 px-3 text-detail gap-1.5',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg border transition-colors',
        'disabled:cursor-not-allowed disabled:text-fg-disabled',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
