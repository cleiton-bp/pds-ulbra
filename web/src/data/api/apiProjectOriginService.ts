import type { ProjectOriginViewModel } from '@/contracts'
import { apiDelete, apiGet, apiPost } from '@/data/api/httpClient'
import type { ProjectOriginService } from '@/data/projectOriginService'

export const apiProjectOriginService: ProjectOriginService = {
  listProjectOrigins: (publicId) =>
    apiGet<ProjectOriginViewModel[]>(`/projects/${publicId}/origins`),

  addProjectOrigin: (publicId, request) =>
    apiPost<ProjectOriginViewModel>(`/projects/${publicId}/origins`, request),

  removeProjectOrigin: (publicId, originPublicId) =>
    apiDelete(`/projects/${publicId}/origins/${originPublicId}`),
}
