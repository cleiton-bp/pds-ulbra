import type { ProjectPublicStageViewModel } from '@/contracts'
import { apiDelete, apiGet, apiPost, apiPut } from '@/data/api/httpClient'
import type { ProjectPublicStageService } from '@/data/projectPublicStageService'

export const apiProjectPublicStageService: ProjectPublicStageService = {
  listPublicStages: (publicId) =>
    apiGet<ProjectPublicStageViewModel[]>(`/projects/${publicId}/public-stages`),

  addPublicStage: (publicId, request) =>
    apiPost<ProjectPublicStageViewModel>(`/projects/${publicId}/public-stages`, request),

  updatePublicStage: (publicId, stagePublicId, request) =>
    apiPut<ProjectPublicStageViewModel>(
      `/projects/${publicId}/public-stages/${stagePublicId}`,
      request,
    ),

  removePublicStage: (publicId, stagePublicId) =>
    apiDelete(`/projects/${publicId}/public-stages/${stagePublicId}`),

  // `order` e `factory` nao sao GUID, entao estas rotas nao se confundem com as
  // que levam o identificador de uma etapa.
  reorderPublicStages: (publicId, request) =>
    apiPut<ProjectPublicStageViewModel[]>(`/projects/${publicId}/public-stages/order`, request),

  applyFactoryPublicStages: (publicId) =>
    apiPost<ProjectPublicStageViewModel[]>(`/projects/${publicId}/public-stages/factory`),
}
