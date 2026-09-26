import { lazy, Suspense, useEffect } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import { environmentById, type EnvironmentId } from '../shared/environments'
import { NavigationProvider, useNavigation } from '../shared/navigation'
import Home from './Home'

/**
 * O editor de cada ambiente. So e baixado quando se entra nele: o inicio abre leve,
 * e quem so mexe na modelagem nunca carrega o editor de casos de uso.
 */
const EDITORS: Record<EnvironmentId, LazyExoticComponent<ComponentType>> = {
  modeling: lazy(() => import('../modeling/App')),
  'use-cases': lazy(() => import('../use-cases/App')),
}

/**
 * Qual tela mostrar, pelo endereco. Cada editor monta do zero ao entrar e desmonta
 * ao sair — o estado de um nunca vaza para o outro.
 */
function Screen() {
  const { route } = useNavigation()

  useEffect(() => {
    document.title = route.env ? `${environmentById(route.env).title} — PDS` : 'Modelagem e casos de uso — PDS'
  }, [route.env])

  if (!route.env) return <Home />
  const Editor = EDITORS[route.env]
  return (
    <Suspense fallback={<div className="empty-state"><p>abrindo…</p></div>}>
      <Editor key={route.env} />
    </Suspense>
  )
}

export default function Shell() {
  return (
    <NavigationProvider>
      <Screen />
    </NavigationProvider>
  )
}
