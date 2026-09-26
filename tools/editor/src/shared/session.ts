import { useCallback, useState } from 'react'
import type { EnvironmentId } from './environments'
import { parseHash, useNavigation } from './navigation'

/**
 * Qual arquivo abrir ao entrar num ambiente, e como o endereco acompanha o que abriu.
 *
 * Vale o que esta no endereco; sem nada nele, o ultimo arquivo usado naquele
 * ambiente. O "ultimo usado" e conveniencia desta maquina: se o navegador nao
 * deixar guardar, o editor so abre vazio.
 */

const lastKey = (env: EnvironmentId): string => `editor:last:${env}`

export function lastFile(env: EnvironmentId): string | null {
  try {
    return window.localStorage.getItem(lastKey(env))
  } catch {
    return null
  }
}

function rememberFile(env: EnvironmentId, name: string | null): void {
  try {
    if (name) window.localStorage.setItem(lastKey(env), name)
    else window.localStorage.removeItem(lastKey(env))
  } catch { /* armazenamento bloqueado — segue sem lembrar */ }
}

export function useEditorSession(env: EnvironmentId) {
  const { route, replaceFile } = useNavigation()
  // So na montagem: depois disso quem manda e o que a pessoa abre na lista.
  const [initial] = useState(() => ({
    file: route.file ?? lastFile(env),
    // Arquivo pedido pelo endereco que nao existe merece aviso; o "ultimo usado"
    // que sumiu, nao — so nao abre.
    fromAddress: Boolean(route.file),
  }))

  const onOpened = useCallback((name: string | null): void => {
    // Um arquivo que termina de abrir depois de a pessoa ja ter saido do ambiente
    // nao mexe no endereco nem na memoria de outro lugar.
    if (parseHash(window.location.hash).env !== env) return
    replaceFile(name)
    rememberFile(env, name)
  }, [env, replaceFile])

  return {
    initialFile: initial.file,
    initialFromAddress: initial.fromAddress,
    requestedFile: route.file,
    onOpened,
  }
}
