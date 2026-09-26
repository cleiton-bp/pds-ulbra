/**
 * Quando um arquivo foi mexido, do jeito que se fala: "hoje", "ontem", "há 3 dias",
 * e dali para tras a data. Conta dias do calendario, e nao blocos de 24 horas — o
 * arquivo desta manha e de hoje, mesmo visto a noite.
 */
export function whenLabel(mtime: number, now: number = Date.now()): string {
  const startOfDay = (time: number): number => {
    const date = new Date(time)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  }
  const days = Math.round((startOfDay(now) - startOfDay(mtime)) / 86_400_000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 7) return `há ${days} dias`

  const date = new Date(mtime)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}
