import { elementLabel, targetOf } from '../../model/refs'
import type { Ref, UseCaseDoc } from '../../types'

/**
 * Escolhe um ator ou caso de uso — a ponta de uma ligacao, ou o alvo da seta de
 * uma nota. Referencia que o arquivo cita sem existir aparece como opcao marcada,
 * para a pessoa ver o que estava escrito antes de trocar.
 */

type ElementPickerProps = {
  label: string
  doc: UseCaseDoc
  value: Ref | null
  onChange: (uid: string) => void
  /** Permite "nenhum", usado pela nota (que pode ficar solta). */
  allowNone?: boolean
}

const BROKEN = '__missing__'

export default function ElementPicker({ label, doc, value, onChange, allowNone = false }: ElementPickerProps) {
  const target = targetOf(doc, value)
  const brokenText = value && !target && 'missing' in value ? value.missing : ''
  const current = target || (brokenText ? BROKEN : '')

  return (
    <label className="field-group">
      <span>{label}</span>
      <select
        value={current}
        onChange={(event) => {
          if (event.target.value !== BROKEN) onChange(event.target.value)
        }}
      >
        {(allowNone || !current) && <option value="">{allowNone ? '— nenhum' : '— escolha'}</option>}
        {brokenText && <option value={BROKEN}>"{brokenText}" (não existe)</option>}
        {doc.actors.length > 0 && (
          <optgroup label="Atores">
            {doc.actors.map((actor) => (
              <option key={actor.uid} value={actor.uid}>
                {elementLabel({ type: 'actor', uid: actor.uid, actor })}
              </option>
            ))}
          </optgroup>
        )}
        {doc.useCases.length > 0 && (
          <optgroup label="Casos de uso">
            {doc.useCases.map((useCase) => (
              <option key={useCase.uid} value={useCase.uid}>
                {elementLabel({ type: 'useCase', uid: useCase.uid, useCase })}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  )
}

