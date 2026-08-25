import type { ProjectKeyViewModel, RevealedSecretKeyViewModel } from '@/contracts'
import { apiGet, apiPost } from '@/data/api/httpClient'
import type { ProjectKeyService } from '@/data/projectKeyService'

export const apiProjectKeyService: ProjectKeyService = {
  listProjectKeys: (publicId) => apiGet<ProjectKeyViewModel[]>(`/projects/${publicId}/keys`),

  regenerateSecretKey: (publicId) =>
    apiPost<RevealedSecretKeyViewModel>(`/projects/${publicId}/keys/secret`),
}
