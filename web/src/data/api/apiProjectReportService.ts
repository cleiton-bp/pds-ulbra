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
import type { ProjectReportService, ReportFilters } from '@/data/projectReportService'

/**
 * Os filtros da tela de Trabalho na URL, iguais na lista e na contagem. So entra o
 * que esta ligado: filtro vazio na URL seria uma pergunta que ninguem fez.
 *
 * O vencido leva **o dia de quem olha** (`today`): no fim da noite no Brasil, o dia
 * em UTC ja e o seguinte, e o card que vence hoje apareceria como vencido.
 */
export function appendReportFilters(
  query: URLSearchParams,
  filters: ReportFilters | undefined,
  today: Date = new Date(),
): void {
  if (!filters) return
  for (const valor of filters.assignees) query.append('assignee', valor)
  for (const valor of filters.labels) query.append('label', valor)
  for (const valor of filters.priorities) query.append('priority', valor)
  for (const valor of filters.types) query.append('type', valor)
  if (filters.overdue) {
    query.set('due', 'overdue')
    query.set('today', diaLocal(today))
  }
  const busca = filters.search.trim()
  if (busca) query.set('q', busca)
}

const diaLocal = (dia: Date) =>
  `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`

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
    appendReportFilters(query, options?.filters)
    if (options?.parent) query.set('parent', options.parent)

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

  listReportCounts: (publicId, filters) => {
    const query = new URLSearchParams()
    appendReportFilters(query, filters)
    const resto = query.toString()
    return apiGet<ReportStateCountViewModel[]>(
      `/projects/${publicId}/reports/counts${resto ? `?${resto}` : ''}`,
    )
  },

  openReport: (publicId, reportPublicId) =>
    apiGet<ReportDetailViewModel>(`/projects/${publicId}/reports/${reportPublicId}`),

  refreshReport: (publicId, reportPublicId) =>
    apiGet<ReportDetailViewModel>(`/projects/${publicId}/reports/${reportPublicId}?refresh=true`),

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
