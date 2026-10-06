import { useCallback, useState } from 'react'
import type { NotificationSettingsViewModel } from '@/contracts'
import { describeError, notificationService } from '@/data'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

/**
 * As preferencias de aviso da pessoa, valendo em todos os projetos dela.
 *
 * **O que se desliga e o e-mail.** O aviso no sino chega de qualquer jeito, e a
 * mencao nem manda e-mail: so a escolha como responsavel tem os dois caminhos.
 */
export function NotificationSettingsDialog({ onClose }: { onClose: () => void }) {
  const { data, failed, reload } = useAsyncResource(
    useCallback(() => notificationService.getSettings(), []),
  )
  const [salvas, setSalvas] = useState<NotificationSettingsViewModel | null>(null)
  const [salvando, setSalvando] = useState(false)
  const atual = salvas ?? data

  async function trocar(valor: boolean) {
    setSalvando(true)
    try {
      setSalvas(await notificationService.saveSettings({ AssignmentByEmail: valor }))
      toast.done('Preferências salvas.')
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto) onClose()
      }}
      title="Preferências de aviso"
      description="Valem em todos os projetos em que você está."
      footer={<Button onClick={onClose}>Fechar</Button>}
    >
      {failed && (
        <p className="text-detail text-fg-muted">
          Não deu para carregar as preferências.{' '}
          <button type="button" onClick={reload} className="underline underline-offset-2">
            Tentar de novo
          </button>
        </p>
      )}

      {!atual && !failed && <Skeleton className="h-10 w-full" />}

      {atual && (
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer gap-2.5">
            <input
              type="checkbox"
              checked={atual.AssignmentByEmail}
              disabled={salvando}
              onChange={(evento) => void trocar(evento.target.checked)}
              className="mt-1 flex-none accent-accent"
            />
            <span className="min-w-0">
              <span className="block text-detail text-fg">
                E-mail quando me escolherem como responsável por um card
              </span>
              <span className="block text-caption text-fg-muted leading-relaxed">
                O aviso aparece no sino de qualquer jeito.
              </span>
            </span>
          </label>

          <p className="text-caption text-fg-muted leading-relaxed">
            Quando alguém menciona você num comentário entre o time, o aviso aparece só no sino.
          </p>

          {!atual.EmailAvailable && (
            <p className="rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-caption text-warn-fg leading-relaxed">
              Este servidor ainda não manda e-mail. A preferência fica guardada para quando mandar.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
