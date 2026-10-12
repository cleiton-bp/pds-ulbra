import type {
  ProjectCreatedViewModel,
  ProjectTemplate,
  ProjectViewModel,
  UpdateProjectRequest,
} from '@/contracts'

/** Espelha o `ProjectService` da API. */
export interface ProjectService {
  /** Do mais recente para o mais antigo, incluindo arquivados. */
  listProjects(): Promise<ProjectViewModel[]>

  getProject(publicId: string): Promise<ProjectViewModel>

  /**
   * Cria o projeto com a chave publica e o que o modelo traz, numa unica gravacao.
   * Sem modelo, o quadro simples.
   */
  createProject(name: string, template?: ProjectTemplate): Promise<ProjectCreatedViewModel>

  /** Renomeia e/ou arquiva. O que nao vier fica como esta. */
  updateProject(publicId: string, patch: UpdateProjectRequest): Promise<ProjectViewModel>
}
