import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { openProfile } from '@/shared/lib/profileDialogStore'

/**
 * O endereco antigo do perfil, que continua valendo para link salvo e favorito: abre o
 * dialogo do perfil sobre o painel, e nao uma pagina. Chegando direto, o painel embaixo e
 * o hub dos projetos; vindo de uma tela do painel, a volta e para ela. Fechar deixa a
 * pessoa ali — o endereco ja e o de onde ela estava.
 *
 * O `#` segue valendo: `/profile#sons` abre o perfil nos sons.
 */
export function ProfileRoute() {
  const { hash, key } = useLocation()
  const navigate = useNavigate()
  // O modo estrito roda o efeito duas vezes: voltar duas vezes tiraria a pessoa do painel.
  const feito = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: roda uma vez, na chegada ao endereco
  useEffect(() => {
    if (feito.current) return
    feito.current = true
    openProfile({ section: secaoDoEndereco(hash) })
    // A primeira entrada do historico desta aba tem a chave "default": chegou direto, e
    // nao ha tela do painel para onde voltar.
    if (key === 'default') navigate('/projects', { replace: true })
    else navigate(-1)
  }, [])

  return null
}

function secaoDoEndereco(hash: string): string | null {
  try {
    return decodeURIComponent(hash.replace(/^#/, '')) || null
  } catch {
    // `%` solto no endereco: nao ha secao com esse nome, e o perfil abre no topo.
    return null
  }
}
