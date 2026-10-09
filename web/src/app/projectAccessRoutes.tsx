import { Navigate, Outlet, useOutletContext } from 'react-router-dom'
import type { ProjectContext } from '@/shared/hooks/useCurrentProject'
import { canConfigure } from '@/shared/lib/projectAccess'

/**
 * A porta do projeto: **o Trabalho, para todo mundo**. A excecao e quem administra
 * um projeto cujo site **ainda nao mandou relato nenhum** — ai a Instalacao e a
 * proxima coisa a fazer, e e por ela que se entra.
 *
 * Ja foi pelo papel: quem configurava caia sempre na Instalacao, inclusive num
 * projeto com meses de relatos. Quem administra e quem mais abre o painel, e a tela
 * que serve uma vez por projeto virava a capa dele.
 *
 * Os links de fora (o hub) apontam para o projeto, e nao para uma secao,
 * justamente para esta decisao acontecer num lugar so. O seletor do topo mantem a
 * tela em que se estava, e so cai aqui de fora de uma secao.
 */
export function ProjectHome() {
  const { project } = useOutletContext<ProjectContext>()
  const instalar = canConfigure(project) && project.LastReportReceivedAt === null
  return <Navigate to={instalar ? 'start' : 'reports'} replace />
}

/**
 * Envolve as secoes de configuracao. O menu ja nao mostra essas secoes para quem
 * e so membro; isto cobre o endereco digitado ou o link antigo, que levaria a uma
 * tela onde todo salvar responderia 403. O membro vai para o Trabalho, que e onde
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
