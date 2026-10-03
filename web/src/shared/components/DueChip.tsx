import { cn } from '@/shared/lib/cn'
import { formatDay } from '@/shared/lib/datetime'
import { dueState, dueWords } from '@/shared/lib/dueDate'

/**
 * O prazo do card, com o destaque: vermelho vencido, amarelo perto — e sempre com as
 * palavras junto, porque a cor sozinha nao chega a quem nao a ve.
 *
 * `soonDays` e a regra do projeto (Ciclo): faltando ate tantos dias, o prazo fica
 * perto. O vencido nao depende dela.
 */
export function DueChip({
  day,
  soonDays,
  compact = false,
  className,
}: {
  day: string
  soonDays: number
  /** No quadro, sem o ano quando ele e o deste ano: o card e estreito. */
  compact?: boolean
  className?: string
}) {
  const estado = dueState(day, soonDays)
  const palavras = dueWords(day, soonDays)
  // O ano so sai quando e o de agora: "5 de jan." do ano que vem seria outro prazo.
  const desteAno = day.slice(0, 4) === String(new Date().getFullYear())
  const data = compact && desteAno ? formatDay(day).replace(/ de \d{4}$/, '') : formatDay(day)

  // Texto corrido, e nao duas caixas lado a lado: no card estreito, a frase quebra
  // como frase, e nao em duas colunas.
  return (
    <span
      className={cn(
        'tabular-nums',
        estado !== 'later' && 'inline-block rounded-md border px-1.5 py-px',
        estado === 'overdue' && 'border-chip-red-border bg-chip-red-surface text-chip-red-fg',
        estado === 'soon' && 'border-chip-yellow-border bg-chip-yellow-surface text-chip-yellow-fg',
        className,
      )}
    >
      Prazo {data}
      {palavras && ` · ${palavras}`}
    </span>
  )
}
