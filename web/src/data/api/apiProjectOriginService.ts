import type {
  HeldOriginReportsResultViewModel,
  HeldOriginViewModel,
  ObservedOriginViewModel,
  ProjectBlockedOriginViewModel,
  ProjectOriginViewModel,
} from '@/contracts'
import { apiDelete, apiGet, apiPost } from '@/data/api/httpClient'
import type { ProjectOriginService } from '@/data/projectOriginService'

export const apiProjectOriginService: ProjectOriginService = {
  listProjectOrigins: (publicId) =>
    apiGet<ProjectOriginViewModel[]>(`/projects/${publicId}/origins`),

  addProjectOrigin: (publicId, request) =>
    apiPost<ProjectOriginViewModel>(`/projects/${publicId}/origins`, request),

  removeProjectOrigin: (publicId, originPublicId) =>
    apiDelete(`/projects/${publicId}/origins/${originPublicId}`),

  listObservedOrigins: (publicId) =>
    apiGet<ObservedOriginViewModel[]>(`/projects/${publicId}/origins/observed`),

  listBlockedOrigins: (publicId) =>
    apiGet<ProjectBlockedOriginViewModel[]>(`/projects/${publicId}/origins/blocked`),

  blockOrigin: (publicId, request) =>
    apiPost<ProjectBlockedOriginViewModel>(`/projects/${publicId}/origins/blocked`, request),

  unblockOrigin: (publicId, blockedPublicId) =>
    apiDelete(`/projects/${publicId}/origins/blocked/${blockedPublicId}`),

  listPendingOrigins: (publicId) =>
    apiGet<HeldOriginViewModel[]>(`/projects/${publicId}/origins/pending`),

  releasePendingOrigin: (publicId, request) =>
    apiPost<HeldOriginReportsResultViewModel>(
      `/projects/${publicId}/origins/pending/release`,
      request,
    ),

  deletePendingOrigin: (publicId, request) =>
    apiPost<HeldOriginReportsResultViewModel>(
      `/projects/${publicId}/origins/pending/delete`,
      request,
    ),
}
