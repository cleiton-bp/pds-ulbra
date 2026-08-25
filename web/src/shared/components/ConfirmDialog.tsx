import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { useState } from 'react'
import { Button, type ButtonVariant } from '@/shared/components/Button'
import { cn } from '@/shared/lib/cn'

/**
 * `AlertDialog` e nao `Dialog`: nao fecha com clique fora e e anunciado como
 * alerta. Acao sem desfazer nao pode fechar por clique acidental.
 *
 * `description` diz **a consequencia**, nunca "tem certeza?". `primary` escolhe
 * qual botao recebe o acento, porque nem sempre a acao confirmada e a recomendada
 * — com a chave secreta na tela, o destaque e voltar e copiar.
 */
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'neutral' | 'warn'
  primary?: 'confirm' | 'cancel'
  onConfirm: () => Promise<void> | void
  onCancel?: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'neutral',
  primary = 'confirm',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [running, setRunning] = useState(false)

  async function handleConfirm(event: React.MouseEvent) {
    // O Radix fecharia o dialogo no clique; aqui ele so fecha quando a operacao
    // termina, para o botao continuar respondendo enquanto a chamada acontece.
    event.preventDefault()
    setRunning(true)

    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setRunning(false)
    }
  }

  // `asChild` empresta o comportamento do Radix ao nosso `Button`, em vez de
  // copiar as variantes aqui — copia de estilo do canonico envelhece calada.
  const confirmVariant: ButtonVariant =
    primary === 'confirm' ? (tone === 'warn' ? 'warn' : 'primary') : 'quiet'
  const cancelVariant: ButtonVariant = primary === 'cancel' ? 'primary' : 'quiet'

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-veil bg-overlay" />
        <AlertDialog.Content
          className={cn(
            '-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-dialog w-[min(27.5rem,calc(100vw-2rem))] rounded-xl border bg-surface-raised p-6',
            tone === 'warn' ? 'border-warn-border' : 'border-border',
          )}
        >
          <AlertDialog.Title
            className={cn(
              'mb-2 font-semibold text-dialog',
              tone === 'warn' ? 'text-warn-fg' : 'text-fg',
            )}
          >
            {title}
          </AlertDialog.Title>

          <AlertDialog.Description className="mb-5 text-detail text-fg-muted leading-relaxed">
            {description}
          </AlertDialog.Description>

          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant={cancelVariant} disabled={running} onClick={onCancel}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>

            <AlertDialog.Action asChild>
              <Button variant={confirmVariant} disabled={running} onClick={handleConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
