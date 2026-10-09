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
 *
 * **A primeira nao derruba nada.** O projeto nasce sem secreta; gerar a primeira so
 * avisa que o valor aparece uma vez, sem o ambar de quem vai trocar uma chave em uso.
 */
export function RegenerateSecretDialog({
  projectPublicId,
  replacing,
  open,
  onOpenChange,
  onRegenerated,
}: {
  projectPublicId: string
  /** Ja existe uma secreta valendo, e a nova toma o lugar dela. */
  replacing: boolean
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
      title={replacing ? 'Gerar nova chave secreta' : 'Gerar chave secreta'}
      description={
        replacing
          ? 'A chave de hoje para de funcionar no momento em que a nova nasce. Se algum servidor seu já usa a chave atual, ele vai responder com erro até receber a nova — a troca costuma levar um minuto: copie a chave nova e substitua onde a antiga estiver. O valor completo aparece uma única vez, logo depois de gerar.'
          : 'O valor completo aparece uma única vez, logo depois de gerar: copie e guarde no servidor que vai usá-la. Se perder, dá para gerar outra.'
      }
      confirmLabel={replacing ? 'Gerar nova chave' : 'Gerar chave'}
      tone={replacing ? 'warn' : 'neutral'}
      onConfirm={regenerate}
    />
  )
}
