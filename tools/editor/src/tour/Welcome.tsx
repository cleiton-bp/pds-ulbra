import { useEffect, useRef, useState } from 'react'
import type { EnvironmentId } from '../shared/environments'
import Icon from '../shared/Icon'

/** O que a pergunta diz em cada ambiente: cada um tem a sua, e a sua caixinha. */
const WORDS: Record<EnvironmentId, { title: string; never: string }> = {
  modeling: { title: 'Primeira vez na modelagem?', never: 'Não perguntar de novo na modelagem' },
  'use-cases': { title: 'Primeira vez nos casos de uso?', never: 'Não perguntar de novo nos casos de uso' },
}

const neverKey = (env: EnvironmentId): string => `editor:welcome-never:${env}`

/**
 * Se a pergunta ainda aparece neste ambiente: ate alguem marcar a caixinha dele.
 * Com o armazenamento bloqueado, nao: ela voltaria em toda entrada, sem saida.
 */
export function wantsWelcome(env: EnvironmentId): boolean {
  try {
    return window.localStorage.getItem(neverKey(env)) !== '1'
  } catch {
    return false
  }
}

/**
 * A pergunta de quem entra num ambiente: e a primeira vez? Sim abre o tour no
 * arquivo aberto (ver `tour/`); nao segue para a tela. Volta a cada entrada no
 * ambiente (pelo inicio ou pela aba do outro) ate a pessoa marcar a caixinha
 * daquele ambiente. O tour continua no ? da barra.
 */
export default function Welcome({ env, onAnswer }: { env: EnvironmentId; onAnswer: (start: boolean) => void }) {
  const [never, setNever] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const startRef = useRef<HTMLButtonElement>(null)
  const words = WORDS[env]

  useEffect(() => { startRef.current?.focus() }, [])

  const answer = (start: boolean): void => {
    if (leaving) return
    if (never) {
      try {
        window.localStorage.setItem(neverKey(env), '1')
      } catch { /* armazenamento bloqueado: a escolha so nao fica lembrada */ }
    }
    setLeaving(true)
    // Sai com o mesmo movimento com que entrou, e so entao segue.
    setTimeout(() => onAnswer(start), 140)
  }

  // Esc e "já conheço". Os atalhos da tela esperam a resposta.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ') return
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); answer(false) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <div className={`dialog-backdrop${leaving ? ' is-leaving' : ''}`} onMouseDown={() => answer(false)}>
      <div
        className="dialog welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="boas-vindas-titulo"
        aria-describedby="boas-vindas-texto"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog__icon welcome__icon" aria-hidden="true"><Icon name="help" /></div>
        <div className="dialog__body">
          <h2 id="boas-vindas-titulo" className="dialog__title">{words.title}</h2>
          <p id="boas-vindas-texto" className="dialog__text">Um tour rápido explica este arquivo e a tela.</p>
        </div>
        <label className="welcome__never">
          <input type="checkbox" checked={never} onChange={(event) => setNever(event.target.checked)} />
          <span>{words.never}</span>
        </label>
        <div className="dialog__actions">
          <button className="btn" onClick={() => answer(false)}>Já conheço</button>
          <button ref={startRef} className="btn btn--primary" onClick={() => answer(true)}>Sim, me mostre</button>
        </div>
      </div>
    </div>
  )
}
