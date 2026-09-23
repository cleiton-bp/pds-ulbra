import type { PanelAttachmentViewModel } from '@/contracts'
import { apiGet } from '@/data/api/httpClient'
import type { ProjectReportAttachmentService } from '@/data/projectReportAttachmentService'

export const apiProjectReportAttachmentService: ProjectReportAttachmentService = {
  listAttachments: (projectPublicId, reportPublicId) =>
    apiGet<PanelAttachmentViewModel[]>(
      `/projects/${projectPublicId}/reports/${reportPublicId}/attachments`,
    ),
}
