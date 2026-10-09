import type { CloseSprintResultViewModel, SprintViewModel } from '@/contracts'
import { apiDelete, apiGet, apiPost, apiPut } from '@/data/api/httpClient'
import type { SprintService } from '@/data/sprintService'

export const apiSprintService: SprintService = {
  listSprints: (publicId, options) =>
    apiGet<SprintViewModel[]>(
      `/projects/${publicId}/sprints${options?.closed ? '?closed=true' : ''}`,
    ),

  createSprint: (publicId, request) =>
    apiPost<SprintViewModel>(`/projects/${publicId}/sprints`, request),

  updateSprint: (publicId, sprintPublicId, request) =>
    apiPut<SprintViewModel>(`/projects/${publicId}/sprints/${sprintPublicId}`, request),

  startSprint: (publicId, sprintPublicId, request) =>
    apiPost<SprintViewModel>(
      `/projects/${publicId}/sprints/${sprintPublicId}/start`,
      request ?? {},
    ),

  closeSprint: (publicId, sprintPublicId, request) =>
    apiPost<CloseSprintResultViewModel>(
      `/projects/${publicId}/sprints/${sprintPublicId}/close`,
      request,
    ),

  deleteSprint: (publicId, sprintPublicId) =>
    apiDelete(`/projects/${publicId}/sprints/${sprintPublicId}`),
}
