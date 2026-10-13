import { useId } from 'react'
import {
  MAX_STATE_NAME_LENGTH,
  type ProjectPublicStageViewModel,
  type ProjectStateViewModel,
} from '@/contracts'
import { Button } from '@/shared/components/Button'
import { Select } from '@/shared/components/Select'
import { TextField } from '@/shared/components/TextField'

/**
 * O rascunho da coluna aberta.
 *
 * `etapa` so existe depois que a pessoa mexe na escolha (`''` e "nada muda"): enquanto
 * ela nao mexe, vale o que o mapa diz agora. Assim o mapa que chega depois de abrir, ou
 * que muda por outra gravacao, nao vira uma "mudanca" que ninguem fez.
 */
export interface StateDraft {
  nome: string
  etapa?: string
}

/**
 * O que se muda numa coluna aberta: o nome e o que quem relatou ve com o relato nela.
 * **Um Salvar para os dois**: a tela renomeia so se o nome mudou e grava o mapa so se a
 * etapa mudou — cada gravacao do mapa e uma versao, e uma versao e uma decisao.
 */
export function StateEditor({
  state,
  draft,
  onChange,
  currentStage,
  stages,
  stagesFailed,
  saving,
  nameError,
  error,
  autoFocus = false,
  onSave,
  onCancel,
}: {
  state: ProjectStateViewModel
  draft: StateDraft
  onChange: (draft: StateDraft) => void
  /** A etapa ligada agora (`''` e nenhuma). */
  currentStage: string
  /** As etapas, com o mapa lido; nulo enquanto le ou se falhou. */
  stages: ProjectPublicStageViewModel[] | null
  stagesFailed: boolean
  saving: boolean
  nameError: string | null
  error: string | null
  autoFocus?: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const base = useId()
  const idNome = `${base}-nome`

  // A coluna desativada sem ligacao nao tem o que escolher: nenhum relato novo entra nela.
  const mostraEtapa = stages !== null && (state.IsActive || currentStage !== '')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor={idNome} className="mb-1.5 block text-detail text-fg-muted">
          Nome
        </label>
        <TextField
          id={idNome}
          ariaLabel={`Novo nome para ${state.Name}`}
          value={draft.nome}
          onChange={(nome) => onChange({ ...draft, nome })}
          error={nameError}
          maxLength={MAX_STATE_NAME_LENGTH}
          disabled={saving}
          autoFocus={autoFocus}
          onSubmit={onSave}
        />
      </div>

      {mostraEtapa && (
        <div>
          {/* O rotulo visivel e curto; o nome acessivel traz a coluna junto, como o
              resto da tela, para quem ouve saber de qual coluna e a escolha. */}
          <span className="mb-1.5 block text-detail text-fg-muted">Quem relatou vê</span>
          <Select
            className="max-w-72"
            ariaLabel={`O que quem relatou vê com o relato em ${state.Name}`}
            value={draft.etapa ?? currentStage}
            disabled={saving}
            onChange={(etapa) => onChange({ ...draft, etapa })}
            hint="A etapa do andamento público enquanto o relato está nesta coluna."
            options={[
              { value: '', label: 'Nada muda para quem relatou' },
              ...stages.map((etapa) => ({ value: etapa.PublicId, label: etapa.Label })),
            ]}
          />
        </div>
      )}
      {stages === null && stagesFailed && (
        <p className="text-caption text-fg-muted leading-relaxed">
          Não deu para carregar o andamento público agora: o nome continua podendo ser salvo.
        </p>
      )}

      {error && (
        <p role="alert" className="text-detail text-error-fg leading-relaxed">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={draft.nome.trim().length === 0 || saving}
          onClick={onSave}
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
