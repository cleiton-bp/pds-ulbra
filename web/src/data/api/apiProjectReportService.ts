import type {
  InternalCommentViewModel,
  ModerationItemViewModel,
  ModerationQueueViewModel,
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
  // O tamanho da pagina e decisao da API: so o quadro manda o dele, e a lista nunca —
  // repeti-lo aqui criaria dois numeros para discordarem no dia em que um mudar.
  listReports: async (publicId, page, state, archived, options) => {
    const query = new URLSearchParams({ page: String(page) })
    // So entra quando ha recorte: `state=` vazio na URL chegaria como string vazia
    // e a API leria isso como "sem filtro" por acaso, e nao por decisao.
    if (state) query.set('state', state)
    if (archived) query.set('archived', 'true')
    if (options?.order) query.set('order', options.order)
    if (options?.pageSize) query.set('pageSize', String(options.pageSize))
    if (options?.after) query.set('after', options.after)

    const { items, total } = await apiGetPage<ReportSummaryViewModel>(
      `/projects/${publicId}/reports?${query}`,
    )

    return { reports: items, total }
  },

  createTeamCard: (publicId, request) =>
    apiPost<ReportDetailViewModel>(`/projects/${publicId}/reports`, request),

  editTeamCard: (publicId, reportPublicId, request) =>
    apiPut<ReportDetailViewModel>(`/projects/${publicId}/reports/${reportPublicId}`, request),

  setArchived: (publicId, reportPublicId, request) =>
    apiPut<ReportDetailViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/archive`,
      request,
    ),

  setTitle: (publicId, reportPublicId, request) =>
    apiPut<ReportDetailViewModel>(`/projects/${publicId}/reports/${reportPublicId}/title`, request),

  setAssignee: (publicId, reportPublicId, request) =>
    apiPut<ReportDetailViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/assignee`,
      request,
    ),

  setPriority: (publicId, reportPublicId, request) =>
    apiPut<ReportDetailViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/priority`,
      request,
    ),

  setLabels: (publicId, reportPublicId, request) =>
    apiPut<ReportDetailViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/labels`,
      request,
    ),

  setDueDate: (publicId, reportPublicId, request) =>
    apiPut<ReportDetailViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/due-date`,
      request,
    ),

  listModeration: (publicId, state) =>
    apiGet<ModerationQueueViewModel>(`/projects/${publicId}/reports/moderation?state=${state}`),

  moderateReport: (publicId, reportPublicId, request) =>
    apiPut<ModerationItemViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/moderation`,
      request,
    ),

  listReportCounts: (publicId) =>
    apiGet<ReportStateCountViewModel[]>(`/projects/${publicId}/reports/counts`),

  openReport: (publicId, reportPublicId) =>
    apiGet<ReportDetailViewModel>(`/projects/${publicId}/reports/${reportPublicId}`),

  moveReport: (publicId, reportPublicId, request) =>
    apiPut<ReportSummaryViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/state`,
      request,
    ),

  setPosition: (publicId, reportPublicId, request) =>
    apiPut<ReportSummaryViewModel>(
      `/projects/${publicId}/reports/${reportPublicId}/position`,
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
