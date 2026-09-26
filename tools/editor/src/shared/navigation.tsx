import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { isEnvironmentId, type EnvironmentId } from './environments'

/**
 * Para onde a tela aponta, e como sair de um editor sem perder o que nao foi gravado.
 *
 * O endereco mora no `#`: `#/` e o inicio, `#/modeling/07-media-attachments.yaml` e
 * a modelagem com a etapa 7 aberta. Assim recarregar a pagina volta ao mesmo lugar, o voltar
 * do navegador sai do editor, e da para guardar o link de um arquivo.
 *
 * Toda saida de um editor passa pelo guarda dele — pelos botoes da tela e tambem
 * pelo voltar do navegador ou por um link colado. Se o guarda recusar (ha edicao
 * que nao da para gravar agora), a tela fica onde esta e o editor diz por que.
 */

export type Route = { env: EnvironmentId | null; file: string | null }

/** O que a pessoa foi fazer ao entrar no ambiente — hoje, so "criar um arquivo". */
export type Intent = 'new-file'

export function parseHash(hash: string): Route {
  const [envPart = '', ...rest] = hash.replace(/^#\/?/, '').split('/')
  let file = ''
  try {
    file = decodeURIComponent(rest.join('/'))
  } catch {
    // `%` sem par no endereco: melhor abrir o ambiente sem arquivo do que quebrar a tela.
  }
  return isEnvironmentId(envPart) ? { env: envPart, file: file || null } : { env: null, file: null }
}

export const routeHash = ({ env, file }: Route): string =>
  !env ? '#/' : file ? `#/${env}/${encodeURIComponent(file)}` : `#/${env}`

/** Pergunta de quem esta saindo: "da para sair agora?" — ver `useLeaveGuard`. */
type LeaveGuard = () => Promise<boolean>

type Navigation = {
  route: Route
  /** Vai para outro lugar, depois de o editor aberto gravar o que tinha pendente. */
  go: (route: Route, options?: { intent?: Intent }) => Promise<void>
  /** Troca o arquivo no endereco sem criar entrada no historico do navegador. */
  replaceFile: (file: string | null) => void
  setLeaveGuard: (guard: LeaveGuard | null) => void
  /** Le e apaga a intencao da ultima ida — so quem entrou no ambiente a usa. */
  takeIntent: () => Intent | null
}

const Context = createContext<Navigation | null>(null)

const currentHash = (): string => window.location.hash || '#/'

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [route, setRouteState] = useState<Route>(() => parseHash(window.location.hash))
  const routeRef = useRef(route)
  const guardRef = useRef<LeaveGuard | null>(null)
  /** Endereco que o `go` ja liberou pelo guarda — a mudanca que ele causa nao pergunta de novo. */
  const approvedRef = useRef<string | null>(null)
  const intentRef = useRef<Intent | null>(null)

  const setRoute = useCallback((next: Route): void => {
    routeRef.current = next
    setRouteState(next)
  }, [])

  useEffect(() => {
    const onHashChange = (): void => {
      const hash = currentHash()
      const next = parseHash(hash)
      const previous = routeRef.current
      const approved = approvedRef.current === hash
      approvedRef.current = null

      // So sair de um ambiente precisa do guarda; trocar de arquivo dentro dele, o
      // proprio editor cuida.
      const guard = guardRef.current
      if (approved || next.env === previous.env || !guard) {
        setRoute(next)
        return
      }
      void guard().then((ok) => {
        if (ok) setRoute(parseHash(currentHash()))
        // Recusou: o endereco volta a apontar para onde a tela continua.
        else window.history.pushState(null, '', routeHash(previous))
      })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [setRoute])

  const go = useCallback(async (next: Route, options: { intent?: Intent } = {}): Promise<void> => {
    const hash = routeHash(next)
    if (next.env !== routeRef.current.env) {
      const guard = guardRef.current
      if (guard && !(await guard())) return
    }
    intentRef.current = options.intent ?? null
    if (hash === currentHash()) {
      setRoute(next)
      return
    }
    approvedRef.current = hash
    window.location.hash = hash
  }, [setRoute])

  const replaceFile = useCallback((file: string | null): void => {
    const next = { ...routeRef.current, file }
    window.history.replaceState(null, '', routeHash(next))
    setRoute(next)
  }, [setRoute])

  const setLeaveGuard = useCallback((guard: LeaveGuard | null): void => {
    guardRef.current = guard
  }, [])

  const takeIntent = useCallback((): Intent | null => {
    const intent = intentRef.current
    intentRef.current = null
    return intent
  }, [])

  // Alt+0 volta ao inicio de qualquer editor. `code`, e nao `key`: no Mac, Alt+0 digita "º".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey || event.code !== 'Digit0' || !routeRef.current.env) return
      event.preventDefault()
      void go({ env: null, file: null })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [go])

  const value = useMemo(
    () => ({ route, go, replaceFile, setLeaveGuard, takeIntent }),
    [route, go, replaceFile, setLeaveGuard, takeIntent],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useNavigation(): Navigation {
  const value = useContext(Context)
  if (!value) throw new Error('useNavigation precisa estar dentro de NavigationProvider')
  return value
}

/** O editor aberto registra como gravar antes de alguem sair dele. */
export function useLeaveGuard(guard: LeaveGuard): void {
  const { setLeaveGuard } = useNavigation()
  useEffect(() => {
    setLeaveGuard(guard)
    return () => setLeaveGuard(null)
  }, [guard, setLeaveGuard])
}
