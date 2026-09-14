import type { ProjectStateViewModel } from '@/contracts'
import { apiGet, apiPost, apiPut } from '@/data/api/httpClient'
import type { ProjectStateService } from '@/data/projectStateService'

export const apiProjectStateService: ProjectStateService = {
  listProjectStates: (publicId) => apiGet<ProjectStateViewModel[]>(`/projects/${publicId}/states`),

  addProjectState: (publicId, request) =>
    apiPost<ProjectStateViewModel>(`/projects/${publicId}/states`, request),

  renameProjectState: (publicId, statePublicId, request) =>
    apiPut<ProjectStateViewModel>(`/projects/${publicId}/states/${statePublicId}`, request),

  // `order` nao e um GUID, entao esta rota nao se confunde com a de renomear.
  reorderProjectStates: (publicId, request) =>
    apiPut<ProjectStateViewModel[]>(`/projects/${publicId}/states/order`, request),

  deactivateProjectState: (publicId, statePublicId) =>
    apiPost<ProjectStateViewModel>(`/projects/${publicId}/states/${statePublicId}/deactivate`),

  activateProjectState: (publicId, statePublicId) =>
    apiPost<ProjectStateViewModel>(`/projects/${publicId}/states/${statePublicId}/activate`),
}
