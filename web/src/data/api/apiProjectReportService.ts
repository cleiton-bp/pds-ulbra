import type {
  InternalCommentViewModel,
  PublicCommentViewModel,
  ReportCommentsViewModel,
  ReportDetailViewModel,
  ReportHistoryEntryViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
} from '@/contracts'
import { apiGet, apiGetPage, apiPost, apiPut } from '@/data/api/httpClient'
import type { ProjectReportService } from '@/data/projectReportService'

export const apiProjectReportService: ProjectReportService = {
  // Sem `pageSize`: o tamanho da pagina e decisao da API, e repeti-lo aqui criaria
  // dois numeros para discordarem no dia em que um mudar.
  listReports: async (publicId, page, state) => {
    const query = new URLSearchParams({ page: String(page) })
    // So entra quando ha recorte: `state=` vazio na URL chegaria como string vazia
    // e a API leria isso como "sem filtro" por acaso, e nao por decisao.
    if (state) query.set('state', state)

    const { items, total } = await apiGetPage<ReportSummaryViewModel>(
      `/projects/${publicId}/reports?${query}`,
    )

    return { reports: items, total }
  },

  listReportCounts: (publicId) =>
    apiGet<ReportStateCountViewModel[]>(`/projects/${publicId}/reports/counts`),

  openReport: (publicId, reportPublicId) =>
    apiGet<ReportDetailViewModel>(`/projects/${publicId}/reports/${reportPublicId}`),

  moveReport: (publicId, reportPublicId, request) =>
    apiPut<ReportSummaryViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/state`,
      request,
    ),
  closeReport: (publicId, reportPublicId, request) =>
    apiPost<ReportDetailViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/closure`,
      request,
    ),

  askInfo: (publicId, reportPublicId, request) =>
    apiPost<ReportDetailViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/info-request`,
      request,
    ),

  listComments: (publicId, reportPublicId) =>
    apiGet<ReportCommentsViewModel>(`/projects/${publicId}/reports/${reportPublicId}/comments`),

  // Duas rotas, e nao uma com um campo: a separacao e estrutural ate aqui.
  addInternalComment: (publicId, reportPublicId, request) =>
    apiPost<InternalCommentViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/comments/internal`,
      request,
    ),

  addPublicComment: (publicId, reportPublicId, request) =>
    apiPost<PublicCommentViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/comments/public`,
      request,
    ),

  listReportHistory: (publicId, reportPublicId) =>
    apiGet<ReportHistoryEntryViewModel[]>(
      `/projects/${publicId}/reports/${reportPublicId}/history`,
    ),
}
