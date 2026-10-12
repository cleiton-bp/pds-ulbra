import type { ReportLimitsViewModel, SaveReportLimitsRequest } from '@/contracts'

/** Os limites de relato de um projeto, na secao "Limites" de Quem relata. */
export interface ProjectReportLimitsService {
  /** Os que valem, os de fabrica e os tetos. Sem nada salvo, valem os de fabrica. */
  getReportLimits(publicId: string): Promise<ReportLimitsViewModel>

  /** Os seis valores, gravados juntos. So quem administra. */
  saveReportLimits(
    publicId: string,
    limits: SaveReportLimitsRequest,
  ): Promise<ReportLimitsViewModel>
}
