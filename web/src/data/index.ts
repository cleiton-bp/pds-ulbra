import { apiAuthService } from '@/data/api/apiAuthService'
import { apiProjectCycleSettingsService } from '@/data/api/apiProjectCycleSettingsService'
import { apiProjectIdentitySettingsService } from '@/data/api/apiProjectIdentitySettingsService'
import { apiProjectKeyService } from '@/data/api/apiProjectKeyService'
import { apiProjectLabelService } from '@/data/api/apiProjectLabelService'
import { apiProjectMediaSettingsService } from '@/data/api/apiProjectMediaSettingsService'
import { apiProjectOriginService } from '@/data/api/apiProjectOriginService'
import { apiProjectPriorityService } from '@/data/api/apiProjectPriorityService'
import { apiProjectPublicStageService } from '@/data/api/apiProjectPublicStageService'
import { apiProjectReportAttachmentService } from '@/data/api/apiProjectReportAttachmentService'
import { apiProjectReportService } from '@/data/api/apiProjectReportService'
import { apiProjectService } from '@/data/api/apiProjectService'
import { apiProjectStateService } from '@/data/api/apiProjectStateService'
import { apiProjectStatusMappingService } from '@/data/api/apiProjectStatusMappingService'
import { apiProjectTeamService } from '@/data/api/apiProjectTeamService'
import { apiProjectWidgetSettingsService } from '@/data/api/apiProjectWidgetSettingsService'
import { apiRealtimeService } from '@/data/api/apiRealtimeService'
import type { AuthService } from '@/data/authService'
import type { ProjectCycleSettingsService } from '@/data/projectCycleSettingsService'
import type { ProjectIdentitySettingsService } from '@/data/projectIdentitySettingsService'
import type { ProjectKeyService } from '@/data/projectKeyService'
import type { ProjectLabelService } from '@/data/projectLabelService'
import type { ProjectMediaSettingsService } from '@/data/projectMediaSettingsService'
import type { ProjectOriginService } from '@/data/projectOriginService'
import type { ProjectPriorityService } from '@/data/projectPriorityService'
import type { ProjectPublicStageService } from '@/data/projectPublicStageService'
import type { ProjectReportAttachmentService } from '@/data/projectReportAttachmentService'
import type { ProjectReportService } from '@/data/projectReportService'
import type { ProjectService } from '@/data/projectService'
import type { ProjectStateService } from '@/data/projectStateService'
import type { ProjectStatusMappingService } from '@/data/projectStatusMappingService'
import type { ProjectTeamService } from '@/data/projectTeamService'
import type { ProjectWidgetSettingsService } from '@/data/projectWidgetSettingsService'
import type { RealtimeService } from '@/data/realtimeService'

/**
 * Ponto unico de acesso aos dados. Tela, store e componente importam daqui e
 * nunca de `data/api` — `architecture.test.ts` reprova quem tentar, e e o que
 * mantem a troca de implementacao contida neste arquivo.
 */
export const authService: AuthService = apiAuthService
export const realtimeService: RealtimeService = apiRealtimeService
export const projectService: ProjectService = apiProjectService
export const projectKeyService: ProjectKeyService = apiProjectKeyService
export const projectOriginService: ProjectOriginService = apiProjectOriginService
export const projectCycleSettingsService: ProjectCycleSettingsService =
  apiProjectCycleSettingsService
export const projectIdentitySettingsService: ProjectIdentitySettingsService =
  apiProjectIdentitySettingsService

export const projectMediaSettingsService: ProjectMediaSettingsService =
  apiProjectMediaSettingsService

export const projectReportAttachmentService: ProjectReportAttachmentService =
  apiProjectReportAttachmentService
export const projectReportService: ProjectReportService = apiProjectReportService
export const projectPublicStageService: ProjectPublicStageService = apiProjectPublicStageService
export const projectStatusMappingService: ProjectStatusMappingService =
  apiProjectStatusMappingService
export const projectStateService: ProjectStateService = apiProjectStateService
export const projectPriorityService: ProjectPriorityService = apiProjectPriorityService
export const projectLabelService: ProjectLabelService = apiProjectLabelService
export const projectTeamService: ProjectTeamService = apiProjectTeamService
export const projectWidgetSettingsService: ProjectWidgetSettingsService =
  apiProjectWidgetSettingsService

export type { AuthService } from '@/data/authService'
export { environment } from '@/data/environment'
export { describeError, isPanelError, PanelError } from '@/data/errors'
export type { ProjectCycleSettingsService } from '@/data/projectCycleSettingsService'
export type { ProjectIdentitySettingsService } from '@/data/projectIdentitySettingsService'
export type { ProjectKeyService } from '@/data/projectKeyService'
export type { ProjectLabelService } from '@/data/projectLabelService'
export type { ProjectMediaSettingsService } from '@/data/projectMediaSettingsService'
export type { ProjectOriginService } from '@/data/projectOriginService'
export type { ProjectPriorityService } from '@/data/projectPriorityService'
export type { ProjectPublicStageService } from '@/data/projectPublicStageService'
export type { ProjectReportAttachmentService } from '@/data/projectReportAttachmentService'
export type {
  ProjectReportService,
  ReportFilters,
  ReportFilterType,
  ReportListOptions,
  ReportPage,
} from '@/data/projectReportService'
export { NO_REPORT_FILTERS } from '@/data/projectReportService'
export type { ProjectService } from '@/data/projectService'
export type { ProjectStateService } from '@/data/projectStateService'
export type { ProjectStatusMappingService } from '@/data/projectStatusMappingService'
export type { ProjectTeamService } from '@/data/projectTeamService'
export type { ProjectWidgetSettingsService } from '@/data/projectWidgetSettingsService'
export type {
  RealtimeConnection,
  RealtimeEvent,
  RealtimeHandlers,
  RealtimeService,
  RealtimeStatus,
} from '@/data/realtimeService'
export { clearToken, getToken, UNAUTHORIZED_EVENT } from '@/data/sessionToken'
