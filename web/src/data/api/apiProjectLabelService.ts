import type { ProjectLabelViewModel } from '@/contracts'
import { apiDelete, apiGet, apiPost, apiPut } from '@/data/api/httpClient'
import type { ProjectLabelService } from '@/data/projectLabelService'

export const apiProjectLabelService: ProjectLabelService = {
  listLabels: (publicId) => apiGet<ProjectLabelViewModel[]>(`/projects/${publicId}/labels`),

  addLabel: (publicId, request) =>
    apiPost<ProjectLabelViewModel>(`/projects/${publicId}/labels`, request),

  updateLabel: (publicId, labelPublicId, request) =>
    apiPut<ProjectLabelViewModel>(`/projects/${publicId}/labels/${labelPublicId}`, request),

  deleteLabel: (publicId, labelPublicId) =>
    apiDelete(`/projects/${publicId}/labels/${labelPublicId}`),
}
