import type { CycleSettingsViewModel } from '@/contracts'
import { MAX_INFO_REQUEST_DAYS } from '@/contracts'
import { NumberField } from '@/shared/components/NumberField'
import { useCycleSettingsDraft } from '@/shared/hooks/useSettingsDraft'

/**
 * As regras do ciclo, lidas e salvas por **uma tela de cada vez**: o encerramento no
 * Ciclo, as sprints em Sprints e o fim e os prazos do quadro em Colunas. O registro e
 * um so na API, e `useCycleSettingsDraft` manda de volta o que esta salvo agora com so
 * os campos da tela mudados — ver `useSettingsDraft`.
 */
export function useCycleDraft(
  projectPublicId: string,
  campos: readonly (keyof CycleSettingsViewModel)[],
  mensagemSalvo: string,
) {
  const rascunho = useCycleSettingsDraft(projectPublicId, campos, mensagemSalvo)
  return { ...rascunho, salvar: rascunho.save, descartar: rascunho.discard }
}

/**
 * Um prazo em dias.
 *
 * Um `number` de verdade: teclado numerico no telefone, setas funcionando, e letra
 * recusada pelo navegador. O minimo e **1** nos prazos do pedido de informacao —
 * prazo zero encerraria o relato no mesmo instante em que a pergunta saiu.
 */
export function Dias({
  id,
  rotulo,
  valor,
  explicacao,
  aoTrocar,
  minimo = 1,
  maximo = MAX_INFO_REQUEST_DAYS,
}: {
  id: string
  rotulo: string
  valor: number
  explicacao: string
  aoTrocar: (valor: number) => void
  minimo?: number
  maximo?: number
}) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1.5 block text-detail text-fg-muted">
        {rotulo}
      </label>
      <div className="mb-1 flex items-center gap-2">
        <NumberField
          id={id}
          min={minimo}
          max={maximo}
          value={valor}
          // Campo vazio vira o minimo, e nao `NaN`: apagar tudo para digitar outro
          // numero e o gesto comum, e `NaN` quebraria a comparacao que decide se ha o
          // que salvar. E abaixo do minimo tambem — nos prazos, zero nao e um prazo.
          onChange={(texto) => {
            const numero = Number.parseInt(texto, 10)
            aoTrocar(Number.isNaN(numero) ? minimo : Math.max(minimo, numero))
          }}
        />
        <span className="text-detail text-fg-muted">dias</span>
      </div>
      <p className="text-caption text-fg-muted leading-relaxed">{explicacao}</p>
    </div>
  )
}

/**
 * Uma chave de liga-desliga com a explicacao ao lado.
 *
 * O titulo diz o que acontece **quando ligado**, e nunca o nome da coluna do
 * banco: quem le a tela decide sobre o comportamento, e nao sobre o campo.
 */
export function Marcar({
  id,
  marcado,
  titulo,
  explicacao,
  aoTrocar,
}: {
  /** A ancora da caixa: a busca da configuracao leva ate ela. */
  id?: string
  marcado: boolean
  titulo: string
  explicacao: string
  aoTrocar: (marcado: boolean) => void
}) {
  return (
    <label id={id} className="flex scroll-mt-6 cursor-pointer gap-2.5">
      <input
        type="checkbox"
        checked={marcado}
        onChange={(evento) => aoTrocar(evento.target.checked)}
        className="mt-1 flex-none accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-detail text-fg">{titulo}</span>
        <span className="block text-caption text-fg-muted leading-relaxed">{explicacao}</span>
      </span>
    </label>
  )
}
