import { Navigate, Outlet, useOutletContext } from 'react-router-dom'
import type { ProjectContext } from '@/shared/hooks/useCurrentProject'
import { useScriptInstalled } from '@/shared/hooks/useScriptInstalled'
import { canConfigure } from '@/shared/lib/projectAccess'

/**
 * A porta do projeto: **o Trabalho, para todo mundo**. A excecao e quem administra
 * um projeto cujo sistema **ainda nao mandou relato nenhum**: ai configurar e a
 * proxima coisa a fazer, e se entra pela pagina central, com os primeiros passos no
 * topo. O relato de teste nao conta, porque ele sai do painel e nao prova que o sistema
 * tem o script (era o que trocava a porta pelo Trabalho com 4 de 5 passos por fazer). Ja foi pela Instalacao: ela resolve o script, e o resto da primeira hora
 * (autorizar o dominio, o botao, quem ve, o time) ficava sem lista.
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
  const administra = canConfigure(project)
  // O relato de teste nao abre a porta do Trabalho: ele prova o botao, e nao o sistema.
  // Ate o sistema mandar relato, quem administra continua entrando pelos primeiros passos.
  const sistemaManda = useScriptInstalled(project, administra)
  if (!administra) return <Navigate to="reports" replace />
  // Um instante, enquanto a lista de enderecos chega: decidir antes mandaria para o lugar
  // errado e trocaria de tela na frente da pessoa.
  if (sistemaManda === null) return null
  return <Navigate to={sistemaManda ? 'reports' : 'configure'} replace />
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
