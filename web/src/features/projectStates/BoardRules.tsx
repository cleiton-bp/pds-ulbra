import {
  type CycleSettingsViewModel,
  MAX_DUE_SOON_DAYS,
  MAX_LAST_COLUMN_VISIBLE_DAYS,
} from '@/contracts'
import { Button } from '@/shared/components/Button'
import { SettingsGroup } from '@/shared/components/SettingsGroup'
import type { useCycleSettingsDraft } from '@/shared/hooks/useSettingsDraft'
import { CYCLE_DEFAULTS, changedFromDefaults, defaultsOf } from '@/shared/lib/factoryDefaults'

/** As regras do quadro que moram no registro do ciclo, com o nome do "Mudou". */
const CAMPOS_DO_QUADRO = [
  ['LastColumnVisibleDays', 'Dias da última coluna'],
  ['DueSoonDays', 'Destaque do prazo'],
] as const satisfies ReadonlyArray<readonly [keyof CycleSettingsViewModel, string]>

/** So estes dois campos contam e sao gravados: o resto do registro e do Ciclo e de Sprints. */
export const CAMPOS_DO_QUADRO_CHAVES = CAMPOS_DO_QUADRO.map(([campo]) => campo)

/** O ancora do grupo: a busca e os avisos chegam por ela. */
const ID_DO_GRUPO = 'fim-e-prazos'

/**
 * Como o quadro mostra o fim e os prazos, num grupo proprio abaixo das colunas.
 *
 * **Mora aqui, perto das colunas**, e nao no Ciclo: as duas regras falam do quadro —
 * quantos dias a ultima coluna mostra, e quando o prazo fica em destaque. Sao campos do
 * registro das regras do ciclo, e a gravacao manda o que esta salvo agora com so estes
 * dois mudados (`useCycleSettingsDraft`, que a tela cria: ela tambem le dali quando o
 * relato encerra, para marcar a coluna).
 *
 * **Um grupo como os das outras telas** (`SettingsGroup`): fechado, ja diz o valor e o
 * que mudou do padrao. Os campos ficam sempre ali dentro, sem "Alterar" no meio: o
 * Salvar e do grupo, e so ele grava — a tela grava cada coisa no seu Salvar.
 */
export function BoardRules({ regras }: { regras: ReturnType<typeof useCycleSettingsDraft> }) {
  const { draft, saving, dirty } = regras

  // Sem as regras, o grupo nao aparece: e um ajuste fino, e a falha nao pode tomar o
  // lugar da lista de colunas.
  if (!draft) return null

  return (
    // `#mais-opcoes` era o "Mais opções" que guardava estas regras: o endereco antigo
    // cai aqui.
    <div id="mais-opcoes" className="mt-6 scroll-mt-6">
      <SettingsGroup
        name="colunas-regras"
        id={ID_DO_GRUPO}
        title="Fim e prazos no quadro"
        value={
          <>
            Última coluna: {dias(draft.LastColumnVisibleDays, 'todos')} · Prazo:{' '}
            {dias(draft.DueSoonDays, 'só no dia')}
            {dirty && <span className="text-warn-fg"> · não salvo</span>}
          </>
        }
        changes={changedFromDefaults(draft, CYCLE_DEFAULTS, CAMPOS_DO_QUADRO)}
        onReset={() => {
          regras.change(defaultsOf(CYCLE_DEFAULTS, CAMPOS_DO_QUADRO))
          // O padrao vai para o rascunho, e quem grava e o Salvar de dentro: o grupo abre
          // para ele estar a vista.
          const grupo = document.getElementById(ID_DO_GRUPO)?.closest('details')
          if (grupo) grupo.open = true
        }}
      >
        <NumeroDeDias
          id="ultima-coluna"
          rotulo="A última coluna mostra o que entrou nela nos últimos"
          maximo={MAX_LAST_COLUMN_VISIBLE_DAYS}
          valor={draft.LastColumnVisibleDays}
          aoTrocar={(LastColumnVisibleDays) => regras.change({ LastColumnVisibleDays })}
          explicacao={
            draft.LastColumnVisibleDays === 0
              ? 'Zero: mostra todos, por mais antigos que sejam.'
              : 'O resto continua na lista do Trabalho. Com uma coluna só, a regra não vale: ali ainda é a entrada da fila.'
          }
        />

        <NumeroDeDias
          id="prazo-perto"
          rotulo="O prazo fica em destaque faltando"
          maximo={MAX_DUE_SOON_DAYS}
          valor={draft.DueSoonDays}
          aoTrocar={(DueSoonDays) => regras.change({ DueSoonDays })}
          explicacao={
            draft.DueSoonDays === 0
              ? 'Zero: só no próprio dia.'
              : 'Em amarelo, no quadro e na lista; o vencido fica sempre em vermelho.'
          }
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" disabled={!dirty || saving} onClick={() => void regras.save()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
          {dirty && (
            <Button variant="ghost" disabled={saving} onClick={regras.discard}>
              Cancelar
            </Button>
          )}
        </div>
      </SettingsGroup>
    </div>
  )
}

/** "14 dias", "1 dia" — e o zero dito pelo que ele faz. */
function dias(valor: number, zero: string): string {
  if (valor === 0) return zero
  return valor === 1 ? '1 dia' : `${valor} dias`
}

/**
 * Um numero de dias, de zero ao teto. Um `number` de verdade: teclado numerico no
 * telefone e letra recusada pelo navegador. Campo vazio vira zero, e nao `NaN`, que
 * quebraria a conta de "ha mudanca".
 */
function NumeroDeDias({
  id,
  rotulo,
  valor,
  maximo,
  explicacao,
  aoTrocar,
}: {
  id: string
  rotulo: string
  valor: number
  maximo: number
  explicacao: string
  aoTrocar: (valor: number) => void
}) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1.5 block text-detail text-fg-muted">
        {rotulo}
      </label>
      <div className="mb-1 flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={0}
          max={maximo}
          value={valor}
          onChange={(evento) =>
            aoTrocar(Math.max(0, Number.parseInt(evento.target.value, 10) || 0))
          }
          className="h-9 w-28 scroll-mt-6 rounded-lg border border-border bg-surface-raised px-3 text-body text-fg"
        />
        <span className="text-detail text-fg-muted">dias</span>
      </div>
      <p className="text-caption text-fg-muted leading-relaxed">{explicacao}</p>
    </div>
  )
}
