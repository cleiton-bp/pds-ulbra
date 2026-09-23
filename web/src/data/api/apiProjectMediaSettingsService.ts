import type { MediaSettingsViewModel } from '@/contracts'
import { apiGet, apiPut } from '@/data/api/httpClient'
import type { ProjectMediaSettingsService } from '@/data/projectMediaSettingsService'

export const apiProjectMediaSettingsService: ProjectMediaSettingsService = {
  getMediaSettings: (publicId) =>
    apiGet<MediaSettingsViewModel>(`/projects/${publicId}/media-settings`),

  saveMediaSettings: (publicId, settings) =>
    apiPut<MediaSettingsViewModel>(`/projects/${publicId}/media-settings`, settings),
}
