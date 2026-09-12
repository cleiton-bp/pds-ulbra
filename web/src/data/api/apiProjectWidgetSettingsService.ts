import type { WidgetSettingsViewModel } from '@/contracts'
import { apiGet, apiPut } from '@/data/api/httpClient'
import type { ProjectWidgetSettingsService } from '@/data/projectWidgetSettingsService'

export const apiProjectWidgetSettingsService: ProjectWidgetSettingsService = {
  getWidgetSettings: (publicId) =>
    apiGet<WidgetSettingsViewModel>(`/projects/${publicId}/widget-settings`),

  saveWidgetSettings: (publicId, settings) =>
    apiPut<WidgetSettingsViewModel>(`/projects/${publicId}/widget-settings`, settings),
}
