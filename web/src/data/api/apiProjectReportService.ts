import type { ReportDetailViewModel, ReportSummaryViewModel } from '@/contracts'
import { apiGet, apiGetPage } from '@/data/api/httpClient'
import type { ProjectReportService } from '@/data/projectReportService'

export const apiProjectReportService: ProjectReportService = {
  // Sem `pageSize`: o tamanho da pagina e decisao da API, e repeti-lo aqui criaria
  // dois numeros para discordarem no dia em que um mudar.
  listReports: async (publicId, page) => {
    const { items, total } = await apiGetPage<ReportSummaryViewModel>(
      `/projects/${publicId}/reports?page=${page}`,
    )

    return { reports: items, total }
  },

  openReport: (publicId, reportPublicId) =>
    apiGet<ReportDetailViewModel>(`/projects/${publicId}/reports/${reportPublicId}`),
}
