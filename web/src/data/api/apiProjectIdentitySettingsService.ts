import type { IdentitySettingsViewModel } from '@/contracts'
import { apiGet, apiPut } from '@/data/api/httpClient'
import type { ProjectIdentitySettingsService } from '@/data/projectIdentitySettingsService'

export const apiProjectIdentitySettingsService: ProjectIdentitySettingsService = {
  getIdentitySettings: (publicId) =>
    apiGet<IdentitySettingsViewModel>(`/projects/${publicId}/identity-settings`),

  saveIdentitySettings: (publicId, settings) =>
    apiPut<IdentitySettingsViewModel>(`/projects/${publicId}/identity-settings`, settings),
}
