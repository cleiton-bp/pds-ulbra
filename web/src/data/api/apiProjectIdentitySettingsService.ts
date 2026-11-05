import type {
  IdentitySecretHistoryItemViewModel,
  IdentitySecretViewModel,
  IdentitySettingsViewModel,
} from '@/contracts'
import { apiGet, apiPost, apiPut } from '@/data/api/httpClient'
import type { ProjectIdentitySettingsService } from '@/data/projectIdentitySettingsService'

export const apiProjectIdentitySettingsService: ProjectIdentitySettingsService = {
  getIdentitySettings: (publicId) =>
    apiGet<IdentitySettingsViewModel>(`/projects/${publicId}/identity-settings`),

  saveIdentitySettings: (publicId, settings) =>
    apiPut<IdentitySettingsViewModel>(`/projects/${publicId}/identity-settings`, settings),

  getIdentitySecret: (publicId) =>
    apiGet<IdentitySecretViewModel>(`/projects/${publicId}/identity-settings/secret`),

  rotateIdentitySecret: (publicId) =>
    apiPost<IdentitySecretViewModel>(`/projects/${publicId}/identity-settings/secret/rotate`),

  getIdentitySecretHistory: (publicId) =>
    apiGet<IdentitySecretHistoryItemViewModel[]>(
      `/projects/${publicId}/identity-settings/secret/history`,
    ),
}
