import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import type { RevealedSecretKeyViewModel } from '@/contracts'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { CopyButton } from '@/shared/components/CopyButton'
import { copyText } from '@/shared/lib/clipboard'

/**
 * O unico lugar onde o valor da secreta aparece — e ele **nao volta**. Dai as
 * tres travas do E1-11: o painel ambar avisando que e a unica vez, a confirmacao
 * ao sair (inclusive pelo botao voltar, por onde as pessoas realmente saem) e o
 * aviso do navegador ao fechar a aba.
 *
 * Na confirmacao o acento fica em **voltar e copiar**, nao em sair: a acao
 * recomendada e a que ganha destaque. E o texto lembra que da para gerar outra —
 * o aviso precisa ser serio sem virar ameaca.
 */
interface RevealedSecretPanelProps {
  secret: RevealedSecretKeyViewModel
  onAcknowledge: () => void
}

export function RevealedSecretPanel({ secret, onAcknowledge }: RevealedSecretPanelProps) {
  const [leaving, setLeaving] = useState(false)

  // Enquanto nao confirmou, qualquer navegacao interna passa por aqui primeiro.
  const blocker = useBlocker(true)

  useEffect(() => {
    if (blocker.state === 'blocked') setLeaving(true)
  }, [blocker.state])

  useEffect(() => {
    // O roteador nao ve fechar aba nem recarregar; o navegador so avisa se alguem
    // cancelar o evento.
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [])

  return (
    <section className="mb-6 rounded-xl border border-warn-border bg-warn-surface px-5 py-4.5">
      <h2 className="mb-1 font-semibold text-lead text-warn-fg">Copie a chave secreta agora</h2>
      <p className="mb-3.5 text-detail text-warn-fg leading-relaxed">
        Este é o único momento em que o valor completo aparece na tela. Depois de fechar não há como
        mostrá-lo de novo — e, se precisar, você pode gerar outra chave quando quiser.
      </p>

      <div className="mb-3.5 flex items-center gap-2">
        <code className="flex h-9 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-warn-border bg-surface px-3 font-mono text-detail text-fg">
          {secret.Value}
        </code>
        <CopyButton value={secret.Value} variant="warn" />
      </div>

      <Button variant="quiet" className="border-warn-border text-warn-fg" onClick={onAcknowledge}>
        Guardei a chave
      </Button>

      <ConfirmDialog
        open={leaving}
        onOpenChange={(open) => {
          if (!open) {
            setLeaving(false)
            blocker.reset?.()
          }
        }}
        title="A chave nova ainda está na tela"
        description="Se você sair agora, o valor completo não volta a aparecer. Copiar leva um segundo — e, se sair sem copiar, dá para gerar outra depois."
        confirmLabel="Sair mesmo assim"
        cancelLabel="Voltar e copiar"
        primary="cancel"
        onCancel={() => {
          setLeaving(false)
          blocker.reset?.()
          void copyText(secret.Value)
        }}
        onConfirm={() => {
          onAcknowledge()
          blocker.proceed?.()
        }}
      />
    </section>
  )
}
