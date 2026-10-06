import type { ReportStateCountViewModel } from '@/contracts'
import { type StatusTone, statusToneClasses } from '@/features/reports/cardLook'
import { Select } from '@/shared/components/Select'

/**
 * Onde o card esta na fila, e o controle que o move. Serve o relato e o card do
 * time: mover e o mesmo gesto nos dois.
 *
 * **No card aberto, ele e o selo da coluna**: o nome dela em caixa alta, na cor do tom
 * (por fazer, fazendo, feito), no alto da coluna da direita — o mesmo desenho da
 * linha da lista, que ali vira controle. O nome do controle e o `ariaLabel` do
 * proprio `Select`.
 */
export function ColumnSelect({
  colunas,
  atual,
  disabled,
  tone,
  aoEscolher,
}: {
  colunas: ReportStateCountViewModel[]
  /** A coluna em que o card esta, ou nulo quando ainda nao tem nenhuma. */
  atual: string | null
  disabled: boolean
  /** O tom da coluna atual. */
  tone: StatusTone
  aoEscolher: (statePublicId: string) => void
}) {
  return (
    <Select
      className="max-w-full"
      size="sm"
      ariaLabel="Mover para a coluna"
      triggerClassName={`w-auto max-w-full font-semibold uppercase tracking-wide ${statusToneClasses(tone)}`}
      value={atual ?? ''}
      disabled={disabled}
      // Escolher move o card: a letra digitada com a lista fechada so abre a lista.
      openOnType
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
  )
}
