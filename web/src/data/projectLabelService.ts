import type {
  CreateProjectLabelRequest,
  ProjectLabelViewModel,
  UpdateProjectLabelRequest,
} from '@/contracts'

/**
 * As etiquetas do projeto. **Criar e de qualquer pessoa do time** — e assim que se
 * etiqueta; mudar e apagar sao do administrador.
 */
export interface ProjectLabelService {
  listLabels(publicId: string): Promise<ProjectLabelViewModel[]>

  /** Cria — ou devolve a que ja existe com o mesmo nome, sem diferenciar maiuscula. */
  addLabel(publicId: string, request: CreateProjectLabelRequest): Promise<ProjectLabelViewModel>

  updateLabel(
    publicId: string,
    labelPublicId: string,
    request: UpdateProjectLabelRequest,
  ): Promise<ProjectLabelViewModel>

  /** Apaga, e a tira de todos os cards. */
  deleteLabel(publicId: string, labelPublicId: string): Promise<void>
}
