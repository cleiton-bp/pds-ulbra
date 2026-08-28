/**
 * A API entrega ISO-8601 UTC; a conversao para o fuso de quem le acontece aqui,
 * na borda. Data virando texto em varios lugares e como fuso vira bug de exibicao.
 */

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const relativeFormatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

/**
 * "02/07/2026, 14:32". Existe separado de `formatDate` porque o registro de
 * chaves revogadas precisa distinguir duas rotacoes do mesmo dia, e o dia
 * sozinho nao faz isso. Formato numerico e nao "02 de jul.": sao duas datas por
 * linha, e a linha nao tem largura para o mes por extenso.
 */
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function parse(isoDate: string | null | undefined): Date | null {
  if (!isoDate) return null
  const parsed = new Date(isoDate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDate(isoDate: string | null | undefined): string {
  const parsed = parse(isoDate)
  return parsed ? dateFormatter.format(parsed) : '—'
}

export function formatDateTime(isoDate: string | null | undefined): string {
  const parsed = parse(isoDate)
  return parsed ? dateTimeFormatter.format(parsed) : '—'
}

const UNITS: Array<{ limitSeconds: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { limitSeconds: 60, divisor: 1, unit: 'second' },
  { limitSeconds: 3600, divisor: 60, unit: 'minute' },
  { limitSeconds: 86400, divisor: 3600, unit: 'hour' },
  { limitSeconds: 2592000, divisor: 86400, unit: 'day' },
  { limitSeconds: 31536000, divisor: 2592000, unit: 'month' },
  { limitSeconds: Number.POSITIVE_INFINITY, divisor: 31536000, unit: 'year' },
]

/** "há 3 minutos", "ontem". `reference` existe para o teste nao depender do relogio. */
export function formatRelative(
  isoDate: string | null | undefined,
  reference: Date = new Date(),
): string {
  const parsed = parse(isoDate)
  if (!parsed) return '—'

  const differenceSeconds = (parsed.getTime() - reference.getTime()) / 1000
  const magnitude = Math.abs(differenceSeconds)

  for (const { limitSeconds, divisor, unit } of UNITS) {
    if (magnitude < limitSeconds) {
      return relativeFormatter.format(Math.round(differenceSeconds / divisor), unit)
    }
  }

  return formatDate(isoDate)
}
