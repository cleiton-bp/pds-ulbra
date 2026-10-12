import { Navigate, useLocation } from 'react-router-dom'

/**
 * Leva o endereco antigo de um campo que mudou de tela para a tela nova: `tool#confirmacao`
 * vira `identity#confirmacao`. Os enderecos com `#` ja foram copiados para conversas e
 * mandados pelo sino; o campo mudar de lugar nao pode quebrar nenhum deles.
 *
 * `moved` diz, para cada ancora que saiu desta tela, o caminho da tela onde ela mora
 * agora. O `state` vai junto: quem chegou pela busca continua com o campo aceso.
 */
export function MovedAnchors({ moved }: { moved: Readonly<Record<string, string>> }) {
  const { hash, state } = useLocation()
  const ancora = hash.replace(/^#/, '')
  const destino = Object.hasOwn(moved, ancora) ? moved[ancora] : undefined
  if (!destino) return null
  return <Navigate to={`../${destino}${hash}`} replace state={state} />
}
