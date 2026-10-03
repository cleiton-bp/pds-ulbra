import type { ProjectPriorityViewModel } from '@/contracts'
import { apiGet, apiPost, apiPut } from '@/data/api/httpClient'
import type { ProjectPriorityService } from '@/data/projectPriorityService'

export const apiProjectPriorityService: ProjectPriorityService = {
  listPriorities: (publicId) =>
    apiGet<ProjectPriorityViewModel[]>(`/projects/${publicId}/priorities`),

  addPriority: (publicId, request) =>
    apiPost<ProjectPriorityViewModel>(`/projects/${publicId}/priorities`, request),

  updatePriority: (publicId, priorityPublicId, request) =>
    apiPut<ProjectPriorityViewModel>(
      `/projects/${publicId}/priorities/${priorityPublicId}`,
      request,
    ),

  // `order` nao e um GUID, entao esta rota nao se confunde com a de mudar.
  reorderPriorities: (publicId, request) =>
    apiPut<ProjectPriorityViewModel[]>(`/projects/${publicId}/priorities/order`, request),

  deactivatePriority: (publicId, priorityPublicId) =>
    apiPost<ProjectPriorityViewModel>(
      `/projects/${publicId}/priorities/${priorityPublicId}/deactivate`,
    ),

  activatePriority: (publicId, priorityPublicId) =>
    apiPost<ProjectPriorityViewModel>(
      `/projects/${publicId}/priorities/${priorityPublicId}/activate`,
    ),
}
