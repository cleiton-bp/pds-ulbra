import type { ProjectReportTypeViewModel } from '@/contracts'
import { apiGet, apiPost, apiPut } from '@/data/api/httpClient'
import type { ProjectReportTypeService } from '@/data/projectReportTypeService'

export const apiProjectReportTypeService: ProjectReportTypeService = {
  listReportTypes: (publicId) =>
    apiGet<ProjectReportTypeViewModel[]>(`/projects/${publicId}/report-types`),

  addReportType: (publicId, request) =>
    apiPost<ProjectReportTypeViewModel>(`/projects/${publicId}/report-types`, request),

  updateReportType: (publicId, typePublicId, request) =>
    apiPut<ProjectReportTypeViewModel>(
      `/projects/${publicId}/report-types/${typePublicId}`,
      request,
    ),

  // `order` nao e um GUID, entao esta rota nao se confunde com a de gravar o tipo.
  reorderReportTypes: (publicId, request) =>
    apiPut<ProjectReportTypeViewModel[]>(`/projects/${publicId}/report-types/order`, request),

  deactivateReportType: (publicId, typePublicId) =>
    apiPost<ProjectReportTypeViewModel>(
      `/projects/${publicId}/report-types/${typePublicId}/deactivate`,
    ),

  activateReportType: (publicId, typePublicId) =>
    apiPost<ProjectReportTypeViewModel>(
      `/projects/${publicId}/report-types/${typePublicId}/activate`,
    ),
}
