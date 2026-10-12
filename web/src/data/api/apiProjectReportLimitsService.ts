import type { ReportLimitsViewModel } from '@/contracts'
import { apiGet, apiPut } from '@/data/api/httpClient'
import type { ProjectReportLimitsService } from '@/data/projectReportLimitsService'

export const apiProjectReportLimitsService: ProjectReportLimitsService = {
  getReportLimits: (publicId) =>
    apiGet<ReportLimitsViewModel>(`/projects/${publicId}/report-limits`),

  saveReportLimits: (publicId, limits) =>
    apiPut<ReportLimitsViewModel>(`/projects/${publicId}/report-limits`, limits),
}
