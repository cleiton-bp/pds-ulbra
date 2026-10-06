import { cn } from '@/shared/lib/cn'
import { formatDay } from '@/shared/lib/datetime'
import { dueState, dueWords } from '@/shared/lib/dueDate'

/**
 * O prazo do card, com o destaque: vermelho vencido, amarelo perto — e sempre com as
 * palavras junto, porque a cor sozinha nao chega a quem nao a ve.
 *
 * `soonDays` e a regra do projeto (Ciclo): faltando ate tantos dias, o prazo fica
 * perto. O vencido nao depende dela.
 *
 * **O card que ja terminou nao tem prazo a cumprir** (`finished`): a data fica, sem
 * cor e sem "venceu ha" — atrasado e o que ainda nao acabou.
 */
export function DueChip({
  day,
  soonDays,
  compact = false,
  bare = false,
  finished = false,
  className,
}: {
  day: string
  soonDays: number
  /** No quadro e na tabela, sem o ano quando ele e o deste ano: o espaco e curto. */
  compact?: boolean
  /** Sem a palavra "Prazo": na tabela, o cabecalho da coluna ja a diz. */
  bare?: boolean
  /** O card ja terminou: a data, sem destaque. */
  finished?: boolean
  className?: string
}) {
  const estado = finished ? 'later' : dueState(day, soonDays)
  const palavras = finished ? null : dueWords(day, soonDays)
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
      {bare ? data : `Prazo ${data}`}
      {palavras && ` · ${palavras}`}
    </span>
  )
}
