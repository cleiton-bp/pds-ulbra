import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'

/**
 * A pergunta ao sair de uma tela com rascunho. O cabecalho das telas de configuracao
 * (`SettingsHeader`) a traz junto; sozinha serve a tela que salva num item, sem o
 * cabecalho — as regras do quadro em Colunas, os limites em Domínios.
 *
 * **Sair com rascunho pergunta antes**, pelo mesmo `useBlocker` da chave secreta:
 * inclusive pelo botao voltar e pelo seletor de projeto, por onde as pessoas realmente
 * saem. Fechar a aba ou recarregar fica com o aviso do navegador.
 *
 * O acento fica em **voltar**, e nao em sair: a acao recomendada e a que ganha
 * destaque, como na chave secreta. Voltar tambem salva, quando da para salvar —
 * e o que a pessoa ia fazer se tivesse visto o botao.
 */
export function LeaveGuard({ when, onSave }: { when: boolean; onSave?: () => void }) {
  const [asking, setAsking] = useState(false)

  // So a troca de endereco conta: o mesmo endereco com outra busca ou outro
  // estado e a propria tela se atualizando.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (blocker.state === 'blocked') setAsking(true)
  }, [blocker.state])

  useEffect(() => {
    if (!when) return

    // O roteador nao ve fechar aba nem recarregar; o navegador so avisa se alguem
    // cancelar o evento.
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [when])

  function voltar() {
    setAsking(false)
    blocker.reset?.()
  }

  return (
    <ConfirmDialog
      open={asking}
      onOpenChange={(open) => {
        if (!open) voltar()
      }}
      title="Sair sem salvar?"
      description="As mudanças desta tela vão se perder."
      confirmLabel="Sair sem salvar"
      cancelLabel={onSave ? 'Voltar e salvar' : 'Voltar'}
      primary="cancel"
      onCancel={() => {
        voltar()
        onSave?.()
      }}
      onConfirm={() => {
        setAsking(false)
        blocker.proceed?.()
      }}
    />
  )
}
