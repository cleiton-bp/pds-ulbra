/**
 * Os limites de relato de um projeto: quantos relatos ele aceita em pouco tempo, por
 * camada, e o intervalo minimo entre dois da mesma pessoa ou do mesmo IP.
 */
export interface ReportLimitValues {
  /** Relatos da mesma pessoa a cada 10 minutos. */
  PerReporter: number
  /** Relatos do mesmo IP por hora. */
  PerIpPerHour: number
  /** Relatos do mesmo endereco de origem por hora. */
  PerOriginPerHour: number
  /** Relatos do projeto inteiro por hora. */
  PerProjectPerHour: number
  /** Relatos do projeto inteiro por dia. */
  PerProjectPerDay: number
  /** Segundos minimos entre dois relatos da mesma pessoa ou do mesmo IP. Zero desliga. */
  MinIntervalSeconds: number
}

/** Os limites que valem, os de fabrica e os tetos do sistema. */
export interface ReportLimitsViewModel {
  Values: ReportLimitValues
  Defaults: ReportLimitValues
  Ceilings: ReportLimitValues
  /** Quantos minutos dura a pausa no dobro de um limite. */
  PauseMinutes: number
}

/** Os seis valores, gravados juntos. */
export type SaveReportLimitsRequest = ReportLimitValues

/** A camada de limite que pausou os envios. */
export type ReportLimitScope = 'Reporter' | 'Ip' | 'Origin' | 'Project'
