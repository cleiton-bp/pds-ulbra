import { Navigate, Outlet, useOutletContext } from 'react-router-dom'
import type { ProjectContext } from '@/shared/hooks/useCurrentProject'
import { canConfigure } from '@/shared/lib/projectAccess'

/**
 * A porta do projeto: quem configura cai na Instalação, quem e so membro cai nos
 * Relatos. Os links de fora (hub, seletor do topo) apontam para o projeto, e nao
 * para uma secao, justamente para esta decisao acontecer num lugar so.
 */
export function ProjectHome() {
  const { project } = useOutletContext<ProjectContext>()
  return <Navigate to={canConfigure(project) ? 'start' : 'reports'} replace />
}

/**
 * Envolve as secoes de Configuração. O menu ja nao mostra essas secoes para quem
 * e so membro; isto cobre o endereco digitado ou o link antigo, que levaria a uma
 * tela onde todo salvar responderia 403. O membro vai para os Relatos, que e onde
 * ele trabalha.
 *
 * Repassa o contexto do projeto adiante: sem isso, a tela de dentro perderia o
 * projeto que a casca carregou.
 */
export function RequireProjectAdministrator() {
  const context = useOutletContext<ProjectContext>()

  if (!canConfigure(context.project)) {
    return <Navigate to={`/projects/${context.project.PublicId}/reports`} replace />
  }

  return <Outlet context={context} />
}
