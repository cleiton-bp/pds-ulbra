import { type ReactNode, useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'

/**
 * A barra das telas de configuracao que salvam num botao, e a trava de saida.
 *
 * **Fica presa no pe da tela enquanto ha o que salvar.** O Salvar no fim de uma
 * pagina longa ficava fora da janela: quem mudava uma coisa no meio e clicava em
 * outra secao achava que tinha salvo, e so descobria quando o comportamento nao
 * mudava. Sem mudanca a barra some — um Salvar sempre a vista convida a clicar sem
 * nada para salvar.
 *
 * **Sair com rascunho pergunta antes** (`LeaveGuard`), pelo mesmo `useBlocker` da
 * chave secreta: inclusive pelo botao voltar e pelo seletor de projeto, por onde as
 * pessoas realmente saem. Fechar a aba ou recarregar fica com o aviso do navegador.
 */
export function UnsavedChangesBar({
  dirty,
  saving,
  canSave = true,
  onSave,
  onDiscard,
  saveLabel = 'Salvar',
  savingLabel = 'Salvando…',
  note,
}: {
  dirty: boolean
  saving: boolean
  /** Falso quando ha mudanca, mas ela nao pode ser salva assim (campo a corrigir). */
  canSave?: boolean
  onSave: () => void
  onDiscard: () => void
  saveLabel?: string
  savingLabel?: string
  /** O que vai ao lado dos botoes. Sem ela, "Alterações não salvas." */
  note?: ReactNode
}) {
  return (
    <>
      <LeaveGuard when={dirty && !saving} onSave={canSave ? onSave : undefined} />

      {dirty && (
        <section
          aria-label="Alterações não salvas"
          className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-raised p-3.5"
        >
          <Button variant="primary" disabled={saving || !canSave} onClick={onSave}>
            {saving ? savingLabel : saveLabel}
          </Button>
          <Button variant="ghost" disabled={saving} onClick={onDiscard}>
            Descartar
          </Button>
          <span className="min-w-0 flex-1 text-detail text-fg-muted">
            {note ?? 'Alterações não salvas.'}
          </span>
        </section>
      )}
    </>
  )
}

/**
 * A pergunta ao sair de uma tela com rascunho. Sozinha serve a tela que salva ao
 * lado do campo, sem barra — o nome do projeto.
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
