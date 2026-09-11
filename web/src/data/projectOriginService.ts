import type { CreateProjectOriginRequest, ProjectOriginViewModel } from '@/contracts'

/** Espelha o `ProjectOriginService` da API. */
export interface ProjectOriginService {
  /** Enderecos autorizados do projeto, em ordem alfabetica. */
  listProjectOrigins(publicId: string): Promise<ProjectOriginViewModel[]>

  /**
   * Autoriza um endereco. O dominio pode ir colado da barra do navegador: a API
   * normaliza antes de gravar e devolve a forma final.
   */
  addProjectOrigin(
    publicId: string,
    request: CreateProjectOriginRequest,
  ): Promise<ProjectOriginViewModel>

  /** Retira a autorizacao. A ferramenta para de abrir la na proxima carga da pagina. */
  removeProjectOrigin(publicId: string, originPublicId: string): Promise<void>
}
