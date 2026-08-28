import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import type { RevealedSecretKeyViewModel } from '@/contracts'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { MaskedValue } from '@/shared/components/MaskedValue'
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
 *
 * **Ele mora dentro do cartao da chave secreta**, no lugar onde o prefixo fica o
 * resto do tempo. Antes abria no topo da tela: quem clicava em "Gerar nova
 * chave" estava com a integracao avancada aberta e rolada, e a resposta ao
 * clique aparecia longe de onde o clique aconteceu.
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
    <div className="mb-3.5 rounded-lg border border-warn-border bg-warn-surface p-3.5">
      <p className="mb-3 text-detail text-warn-fg leading-relaxed">
        Copie a chave agora. Este é o único momento em que o valor completo aparece, e depois de
        fechar não há como mostrá-lo de novo. Se ficar sem ela, gere outra quando quiser.
      </p>

      <MaskedValue value={secret.Value} variant="warn" />

      <Button
        variant="quiet"
        className="mt-3 border-warn-border text-warn-fg"
        onClick={onAcknowledge}
      >
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
    </div>
  )
}
