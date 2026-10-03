import type {
  CreateProjectPriorityRequest,
  ProjectPriorityViewModel,
  ReorderProjectPrioritiesRequest,
  UpdateProjectPriorityRequest,
} from '@/contracts'

/**
 * As prioridades do projeto. O membro le a lista — e dela que escolhe a do card —;
 * criar, mudar, reordenar, aposentar e reativar sao do administrador.
 */
export interface ProjectPriorityService {
  listPriorities(publicId: string): Promise<ProjectPriorityViewModel[]>

  addPriority(
    publicId: string,
    request: CreateProjectPriorityRequest,
  ): Promise<ProjectPriorityViewModel>

  updatePriority(
    publicId: string,
    priorityPublicId: string,
    request: UpdateProjectPriorityRequest,
  ): Promise<ProjectPriorityViewModel>

  reorderPriorities(
    publicId: string,
    request: ReorderProjectPrioritiesRequest,
  ): Promise<ProjectPriorityViewModel[]>

  deactivatePriority(publicId: string, priorityPublicId: string): Promise<ProjectPriorityViewModel>

  activatePriority(publicId: string, priorityPublicId: string): Promise<ProjectPriorityViewModel>
}
