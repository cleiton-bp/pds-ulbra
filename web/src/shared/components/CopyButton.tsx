import { useEffect, useState } from 'react'
import { Button } from '@/shared/components/Button'
import { copyText } from '@/shared/lib/clipboard'

/**
 * A confirmacao troca a **palavra**, nao so a cor, e o `aria-live` anuncia: botao
 * que copia calado deixa a pessoa clicando de novo sem saber se funcionou.
 */
interface CopyButtonProps {
  value: string
  label?: string
  variant?: 'secondary' | 'warn'
  size?: 'md' | 'sm'
  /** Depois de copiar de verdade: quem chama fica sabendo que o texto saiu daqui. */
  onCopied?: () => void
}

export function CopyButton({
  value,
  label = 'Copiar',
  variant = 'secondary',
  size = 'md',
  onCopied,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <Button
      variant={variant}
      size={size}
      onClick={async () => {
        const copiou = await copyText(value)
        setCopied(copiou)
        if (copiou) onCopied?.()
      }}
    >
      <span aria-live="polite">{copied ? 'Copiado' : label}</span>
    </Button>
  )
}
