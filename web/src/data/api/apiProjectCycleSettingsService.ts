import type { CycleSettingsViewModel } from '@/contracts'
import { apiGet, apiPut } from '@/data/api/httpClient'
import type { ProjectCycleSettingsService } from '@/data/projectCycleSettingsService'

export const apiProjectCycleSettingsService: ProjectCycleSettingsService = {
  getCycleSettings: (publicId) =>
    apiGet<CycleSettingsViewModel>(`/projects/${publicId}/cycle-settings`),

  saveCycleSettings: (publicId, settings) =>
    apiPut<CycleSettingsViewModel>(`/projects/${publicId}/cycle-settings`, settings),
}
