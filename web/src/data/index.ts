import { apiAuthService } from '@/data/api/apiAuthService'
import { apiProjectKeyService } from '@/data/api/apiProjectKeyService'
import { apiProjectService } from '@/data/api/apiProjectService'
import type { AuthService } from '@/data/authService'
import { environment } from '@/data/environment'
import { demoDatabase } from '@/data/mock/demoDatabase'
import { mockAuthService } from '@/data/mock/mockAuthService'
import { mockProjectKeyService } from '@/data/mock/mockProjectKeyService'
import { mockProjectService } from '@/data/mock/mockProjectService'
import type { ProjectKeyService } from '@/data/projectKeyService'
import type { ProjectService } from '@/data/projectService'

/**
 * Unico lugar que sabe se os dados vem do mock ou da API. Tela, store e
 * componente nunca importam de `data/mock` nem de `data/api` — `architecture.test.ts`
 * reprova quem tentar. Servico novo entra aqui em tres linhas.
 */
export const authService: AuthService = environment.useApi ? apiAuthService : mockAuthService

export const projectService: ProjectService = environment.useApi
  ? apiProjectService
  : mockProjectService

export const projectKeyService: ProjectKeyService = environment.useApi
  ? apiProjectKeyService
  : mockProjectKeyService

/** No modo API o estado mora no banco: apagar dado de cliente por botao, nunca. */
export function resetDemoData(): void {
  if (!environment.useApi) demoDatabase.reset()
}

export type { AuthService } from '@/data/authService'
export type { OperationMode } from '@/data/environment'
export { describeMode, environment } from '@/data/environment'
export { describeError, isPanelError, PanelError } from '@/data/errors'
export type { ProjectKeyService } from '@/data/projectKeyService'
export type { ProjectService } from '@/data/projectService'
export { clearToken, getToken, UNAUTHORIZED_EVENT } from '@/data/sessionToken'
