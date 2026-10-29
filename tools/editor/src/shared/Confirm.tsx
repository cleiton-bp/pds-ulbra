import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

/**
 * A confirmacao de apagar, no desenho da tela, no lugar do `window.confirm`, que
 * abria a janela crua do navegador ("localhost diz…") por cima de tudo.
 *
 * `confirmDelete` devolve uma promessa: `true` se a pessoa confirmou. O foco comeca
 * em "Cancelar", Enter nao apaga por engano, e Esc ou clique fora cancelam.
 */

type Request = {
  title: string
  message: string
  confirmLabel: string
  resolve: (ok: boolean) => void
}

let show: ((request: Request) => void) | null = null

export function confirmDelete({
  title, message = 'Não dá para desfazer.', confirmLabel = 'Apagar',
}: { title: string; message?: string; confirmLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    // Sem o host na tela (nao deveria acontecer), cai no do navegador: melhor que nao perguntar.
    if (!show) { resolve(window.confirm(`${title}\n${message}`)); return }
    show({ title, message, confirmLabel, resolve })
  })
}

/** Monta uma vez, no topo da tela (ver `Shell`). */
export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null)
  const [leaving, setLeaving] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    show = (next) => { setLeaving(false); setRequest(next) }
    return () => { show = null }
  }, [])

  useEffect(() => { if (request) cancelRef.current?.focus() }, [request])

  const close = (ok: boolean): void => {
    if (!request || leaving) return
    setLeaving(true)
    // Sai com o mesmo movimento com que entrou, e so entao responde.
    setTimeout(() => { request.resolve(ok); setRequest(null); setLeaving(false) }, 140)
  }

  useEffect(() => {
    if (!request) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); close(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!request) return null

  return (
    <div className={`dialog-backdrop${leaving ? ' is-leaving' : ''}`} onMouseDown={() => close(false)}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmar-titulo"
        aria-describedby="confirmar-texto"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog__icon" aria-hidden="true"><Icon name="trash" /></div>
        <div className="dialog__body">
          <h2 id="confirmar-titulo" className="dialog__title">{request.title}</h2>
          <p id="confirmar-texto" className="dialog__text">{request.message}</p>
        </div>
        <div className="dialog__actions">
          <button ref={cancelRef} className="btn" onClick={() => close(false)}>Cancelar</button>
          <button className="btn btn--danger-solid" onClick={() => close(true)}>{request.confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
