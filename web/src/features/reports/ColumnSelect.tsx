import type { ReportStateCountViewModel } from '@/contracts'
import { Select } from '@/shared/components/Select'

/**
 * Onde o card esta na fila, e o controle que o move. Serve o relato e o card do
 * time: mover e o mesmo gesto nos dois.
 *
 * O texto "Coluna" vem num `span`, e nao num `label`: quem da nome ao controle e o
 * `ariaLabel` do proprio `Select`, que vira `aria-label` no `select`. Um `label` por
 * fora, sem `htmlFor`, nao nomeia nada — so parecia nomear.
 */
export function ColumnSelect({
  colunas,
  atual,
  disabled,
  aoEscolher,
}: {
  colunas: ReportStateCountViewModel[]
  /** A coluna em que o card esta, ou nulo quando ainda nao tem nenhuma. */
  atual: string | null
  disabled: boolean
  aoEscolher: (statePublicId: string) => void
}) {
  return (
    <span className="flex items-center gap-1.5 text-caption text-fg-muted">
      Coluna
      <Select
        className="max-w-40"
        size="sm"
        ariaLabel="Mover para a coluna"
        value={atual ?? ''}
        disabled={disabled}
        onChange={(valor) => aoEscolher(valor)}
        options={[
          // "Sem coluna" nao e destino: nao ha como tirar um card da fila de volta,
          // e oferecer isso prometeria uma acao que a API nao tem. Ela so aparece
          // enquanto ele ainda nao tem coluna.
          ...(atual == null ? [{ value: '', label: 'Sem coluna' }] : []),
          ...colunas
            .filter((coluna) => coluna.StatePublicId !== null)
            .filter((coluna) => coluna.IsActive || coluna.StatePublicId === atual)
            .map((coluna) => ({
              value: coluna.StatePublicId as string,
              label: coluna.StateName ?? '',
            })),
        ]}
      />
    </span>
  )
}
