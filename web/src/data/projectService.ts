import type { ProjectCreatedViewModel, ProjectViewModel, UpdateProjectRequest } from '@/contracts'

/** Espelha o `ProjectService` da API. */
export interface ProjectService {
  /** Do mais recente para o mais antigo, incluindo arquivados. */
  listProjects(): Promise<ProjectViewModel[]>

  getProject(publicId: string): Promise<ProjectViewModel>

  /**
   * Cria projeto e par de chaves numa unica gravacao — nao existe projeto sem
   * chave. Unica operacao que devolve o valor da secreta.
   */
  createProject(name: string): Promise<ProjectCreatedViewModel>

  /** Renomeia e/ou arquiva. O que nao vier fica como esta. */
  updateProject(publicId: string, patch: UpdateProjectRequest): Promise<ProjectViewModel>
}
