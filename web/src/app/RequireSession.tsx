import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { UNAUTHORIZED_EVENT } from '@/data'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { useSessionStore } from '@/features/auth/sessionStore'
import { useProjectsStore } from '@/features/projects/projectsStore'

/**
 * Decide entre entrada e painel **sem trocar a URL**: nao ha rota `/login`. Quem
 * abre `/projects/{guid}/keys` sem sessao ve a entrada naquele endereco e, ao
 * entrar, cai direto onde queria — o caso de quem recebeu o link de um colega.
 * (Se tiver acesso: quem e so membro e segue um link de Configuração cai nos
 * Relatos, e quem nao esta no projeto ve "não encontrado".)
 */
export function RequireSession() {
  const status = useSessionStore((state) => state.status)
  const restore = useSessionStore((state) => state.restore)
  const expire = useSessionStore((state) => state.expire)

  useEffect(() => {
    void restore()
  }, [restore])

  useEffect(() => {
    // Sem sessao, os projetos da pessoa anterior nao podem ficar na memoria: quem
    // entrar em seguida no mesmo navegador nao pode ve-los nem por um instante.
    if (status === 'anonymous') useProjectsStore.getState().reset()
  }, [status])

  useEffect(() => {
    // 401 no meio da navegacao, tratado num lugar so: nenhuma tela precisa saber
    // o que fazer quando a sessao vence com a pessoa usando o painel.
    window.addEventListener(UNAUTHORIZED_EVENT, expire)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, expire)
  }, [expire])

  if (status === 'unknown') {
    return <div className="min-h-dvh bg-surface" />
  }

  return status === 'authenticated' ? <Outlet /> : <LoginScreen />
}
