import type { RevealedSecretKeyViewModel } from '@/contracts'
import { describeError, projectKeyService } from '@/data'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { toast } from '@/shared/components/toastStore'

/**
 * O texto diz a consequencia e o **tamanho** dela: as integracoes param, e a
 * troca leva um minuto. So "tem certeza?" faria decidir sem saber; so "vai
 * quebrar tudo" faria nunca girar uma chave que precisa ser girada.
 *
 * Ambar e nao vermelho: nada e destruido — a chave perdida se resolve gerando outra.
 */
export function RegenerateSecretDialog({
  projectPublicId,
  open,
  onOpenChange,
  onRegenerated,
}: {
  projectPublicId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegenerated: (secret: RevealedSecretKeyViewModel) => void
}) {
  async function regenerate() {
    try {
      onRegenerated(await projectKeyService.regenerateSecretKey(projectPublicId))
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Gerar nova chave secreta"
      description="A chave de hoje para de funcionar no momento em que a nova nasce. Se algum servidor seu já usa a chave atual, ele vai responder com erro até receber a nova — a troca costuma levar um minuto: copie a chave nova e substitua onde a antiga estiver. O valor completo aparece uma única vez, logo depois de gerar."
      confirmLabel="Gerar nova chave"
      tone="warn"
      onConfirm={regenerate}
    />
  )
}
