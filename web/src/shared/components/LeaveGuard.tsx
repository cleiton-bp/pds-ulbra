import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { semMovimento } from '@/shared/lib/rolagemSuave'

/**
 * A marca do botao que salva (ou publica) a tela: o "Voltar e salvar" leva ate ele. Fica
 * no botao do cabecalho das telas de configuracao e no "Salvar" de cada editor de item.
 */
export const SAVE_BUTTON_ATTRIBUTE = 'data-salvar-da-tela'

/** Quanto o anel do botao chamando fica no ar: dois pulsos de 850 ms (ver `chama-atencao`). */
const CHAMANDO_MS = 1800

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
 * destaque, como na chave secreta.
 *
 * **Voltar e salvar nao salva sozinho.** Leva a pessoa ate o botao de salvar (ou
 * publicar) da tela, rolando ate ele se ela estava no fim da pagina, poe o foco nele e o
 * faz chamar atencao. Salvar por ela, so por ter escolhido voltar, publicava o que ela
 * ainda podia estar conferindo.
 */
export function LeaveGuard({ when, canSave = false }: { when: boolean; canSave?: boolean }) {
  const [asking, setAsking] = useState(false)
  // A escolha foi voltar para salvar: ao fechar, o foco vai para o botao de salvar.
  const irAoSalvar = useRef(false)

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
      cancelLabel={canSave ? 'Voltar e salvar' : 'Voltar'}
      primary="cancel"
      onCancel={() => {
        irAoSalvar.current = canSave
        voltar()
      }}
      onConfirm={() => {
        setAsking(false)
        blocker.proceed?.()
      }}
      // Depois que o dialogo sai, e nao antes: fechando, ele devolveria o foco ao link
      // por onde a pessoa ia sair.
      onCloseAutoFocus={(evento) => {
        if (!irAoSalvar.current) return
        irAoSalvar.current = false
        if (mostrarOSalvar()) evento.preventDefault()
      }}
    />
  )
}

/**
 * Leva ate o botao de salvar da tela e o faz chamar atencao: rola ate ele, poe o foco
 * nele e o anel pulsa (`data-chamando`, em index.css). Nada e salvo. Devolve se achou um
 * botao que da para usar.
 */
function mostrarOSalvar(): boolean {
  const botao = [
    ...document.querySelectorAll<HTMLButtonElement>(`[${SAVE_BUTTON_ATTRIBUTE}]`),
  ].find((item) => !item.disabled && !item.closest('[hidden], [inert], [aria-hidden="true"]'))
  if (!botao) return false

  botao.scrollIntoView?.({ behavior: semMovimento() ? 'auto' : 'smooth', block: 'center' })
  botao.focus({ preventScroll: true })
  // De novo do comeco, se ainda pulsava de uma volta anterior.
  botao.removeAttribute('data-chamando')
  void botao.offsetWidth
  botao.setAttribute('data-chamando', '')
  window.setTimeout(() => botao.removeAttribute('data-chamando'), CHAMANDO_MS)
  return true
}
