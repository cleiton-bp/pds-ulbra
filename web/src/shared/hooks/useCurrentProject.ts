import { useOutletContext } from 'react-router-dom'
import type { ProjectViewModel } from '@/contracts'

/**
 * O projeto do console, entregue pela casca por contexto de rota — a casca ja
 * carregou o projeto para o seletor do topo, e repetir a chamada em cada aba
 * pediria a mesma resposta tres vezes.
 *
 * Mora em `shared/` porque toda secao do console vai precisar dele: em `app/`
 * inverteria a direcao da camada, e em `features/projects/` faria Relatos,
 * Membros e Uso dependerem da feature `projects` so para ler o que a casca deu.
 */
export interface ProjectContext {
  project: ProjectViewModel
}

export function useCurrentProject(): ProjectViewModel {
  return useOutletContext<ProjectContext>().project
}
