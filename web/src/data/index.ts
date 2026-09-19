import { apiAuthService } from '@/data/api/apiAuthService'
import { apiProjectCycleSettingsService } from '@/data/api/apiProjectCycleSettingsService'
import { apiProjectKeyService } from '@/data/api/apiProjectKeyService'
import { apiProjectOriginService } from '@/data/api/apiProjectOriginService'
import { apiProjectPublicStageService } from '@/data/api/apiProjectPublicStageService'
import { apiProjectReportService } from '@/data/api/apiProjectReportService'
import { apiProjectService } from '@/data/api/apiProjectService'
import { apiProjectStateService } from '@/data/api/apiProjectStateService'
import { apiProjectStatusMappingService } from '@/data/api/apiProjectStatusMappingService'
import { apiProjectWidgetSettingsService } from '@/data/api/apiProjectWidgetSettingsService'
import type { AuthService } from '@/data/authService'
import type { ProjectCycleSettingsService } from '@/data/projectCycleSettingsService'
import type { ProjectKeyService } from '@/data/projectKeyService'
import type { ProjectOriginService } from '@/data/projectOriginService'
import type { ProjectPublicStageService } from '@/data/projectPublicStageService'
import type { ProjectReportService } from '@/data/projectReportService'
import type { ProjectService } from '@/data/projectService'
import type { ProjectStateService } from '@/data/projectStateService'
import type { ProjectStatusMappingService } from '@/data/projectStatusMappingService'
import type { ProjectWidgetSettingsService } from '@/data/projectWidgetSettingsService'

/**
 * Ponto unico de acesso aos dados. Tela, store e componente importam daqui e
 * nunca de `data/api` — `architecture.test.ts` reprova quem tentar, e e o que
 * mantem a troca de implementacao contida neste arquivo.
 */
export const authService: AuthService = apiAuthService
export const projectService: ProjectService = apiProjectService
export const projectKeyService: ProjectKeyService = apiProjectKeyService
export const projectOriginService: ProjectOriginService = apiProjectOriginService
export const projectCycleSettingsService: ProjectCycleSettingsService =
  apiProjectCycleSettingsService
export const projectReportService: ProjectReportService = apiProjectReportService
export const projectPublicStageService: ProjectPublicStageService = apiProjectPublicStageService
export const projectStatusMappingService: ProjectStatusMappingService =
  apiProjectStatusMappingService
export const projectStateService: ProjectStateService = apiProjectStateService
export const projectWidgetSettingsService: ProjectWidgetSettingsService =
  apiProjectWidgetSettingsService

export type { AuthService } from '@/data/authService'
export { environment } from '@/data/environment'
export { describeError, isPanelError, PanelError } from '@/data/errors'
export type { ProjectCycleSettingsService } from '@/data/projectCycleSettingsService'
export type { ProjectKeyService } from '@/data/projectKeyService'
export type { ProjectOriginService } from '@/data/projectOriginService'
export type { ProjectPublicStageService } from '@/data/projectPublicStageService'
export type { ProjectReportService, ReportPage } from '@/data/projectReportService'
export type { ProjectService } from '@/data/projectService'
export type { ProjectStateService } from '@/data/projectStateService'
export type { ProjectStatusMappingService } from '@/data/projectStatusMappingService'
export type { ProjectWidgetSettingsService } from '@/data/projectWidgetSettingsService'
export { clearToken, getToken, UNAUTHORIZED_EVENT } from '@/data/sessionToken'
