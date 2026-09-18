import type { ProjectStatusMappingViewModel } from '@/contracts'
import { apiGet, apiPut } from '@/data/api/httpClient'
import type { ProjectStatusMappingService } from '@/data/projectStatusMappingService'

export const apiProjectStatusMappingService: ProjectStatusMappingService = {
  getStatusMapping: (publicId) =>
    apiGet<ProjectStatusMappingViewModel>(`/projects/${publicId}/status-mappings`),

  saveStatusMapping: (publicId, request) =>
    apiPut<ProjectStatusMappingViewModel>(`/projects/${publicId}/status-mappings`, request),
}
