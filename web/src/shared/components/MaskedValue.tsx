import { useState } from 'react'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { EyeIcon } from '@/shared/components/EyeIcon'
import { cn } from '@/shared/lib/cn'

/**
 * Chave escondida, com olho para revelar e botao para copiar.
 *
 * **Copiar funciona com o valor escondido.** Quem vai colar no site nao precisa
 * ler para levar, e obrigar a revelar antes de copiar transformaria a protecao
 * em pedagio.
 *
 * A mascara usa **uma bolinha por caractere** e nao um punhado fixo delas: o
 * campo mantem a largura ao revelar, entao o olho e o "Copiar" nao pulam de
 * lugar.
 */
export function MaskedValue({
  value,
  variant = 'secondary',
}: {
  value: string
  /** `warn` para o painel ambar da chave recem-gerada. */
  variant?: 'secondary' | 'warn'
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <code
        className={cn(
          'flex h-10 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border bg-surface px-3.5 font-mono text-body text-fg',
          variant === 'warn' ? 'border-warn-border' : 'border-border',
        )}
      >
        {visible ? value : '•'.repeat(value.length)}
      </code>

      <Button
        variant={variant}
        aria-label={visible ? 'Esconder a chave' : 'Mostrar a chave'}
        aria-pressed={visible}
        className="w-9 px-0"
        onClick={() => setVisible((shown) => !shown)}
      >
        <EyeIcon off={visible} className="size-3.5" />
      </Button>

      <CopyButton value={value} variant={variant} />
    </div>
  )
}
