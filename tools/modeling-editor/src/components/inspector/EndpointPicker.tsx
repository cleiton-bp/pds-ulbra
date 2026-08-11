import type { Entity } from '../../types'

/**
 * Escolhe onde uma ponta de linha gruda: a entidade e, opcionalmente, o campo.
 *
 * Sem campo, a linha encosta na borda da caixa. Com campo, ela gruda na altura
 * daquela linha da tabela — FK apontando para PK, como num diagrama de banco.
 */

type EndpointPickerProps = {
  label: string
  entities: Entity[]
  entityName: string
  fieldName: string
  onChange: (entityName: string, fieldName: string) => void
  /** Permite "nenhuma", usado pela nota (que pode ficar solta). */
  allowNone?: boolean
}

export default function EndpointPicker({
  label, entities, entityName, fieldName, onChange, allowNone = false,
}: EndpointPickerProps) {
  const entity = entities.find((e) => e.name === entityName)
  const missingEntity = Boolean(entityName) && !entity
  const missingField = Boolean(fieldName) && Boolean(entity)
    && !entity?.fields.some((f) => f.name === fieldName)

  return (
    <div className="endpoint">
      <span className="endpoint__label">{label}</span>

      <div className="endpoint__row">
        <select
          value={entityName}
          // Trocar de entidade zera o campo: o nome antigo quase nunca existe na nova.
          onChange={(event) => onChange(event.target.value, '')}
        >
          {allowNone && <option value="">— nenhuma</option>}
          {missingEntity && <option value={entityName}>{entityName} (não existe)</option>}
          {entities.map((option) => (
            <option key={option.uid} value={option.name}>{option.name}</option>
          ))}
        </select>

        <select
          value={fieldName}
          disabled={!entity}
          title={entity ? 'onde a linha gruda' : 'escolha a entidade primeiro'}
          onChange={(event) => onChange(entityName, event.target.value)}
        >
          <option value="">— a caixa inteira</option>
          {missingField && <option value={fieldName}>{fieldName} (não existe)</option>}
          {entity?.fields.map((field) => (
            <option key={field.uid} value={field.name}>
              {field.name || '(sem nome)'}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
