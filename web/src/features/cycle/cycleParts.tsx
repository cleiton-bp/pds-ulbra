import { useCallback, useEffect, useState } from 'react'
import type { CycleSettingsViewModel } from '@/contracts'
import { MAX_INFO_REQUEST_DAYS } from '@/contracts'
import { describeError, projectCycleSettingsService } from '@/data'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

/**
 * As regras do ciclo, lidas e salvas por **uma tela de cada vez**.
 *
 * Elas moram num registro so na API, e o salvamento substitui todas de uma vez —
 * mas aparecem em telas diferentes: o encerramento no Ciclo, as sprints em Sprints,
 * e as regras do quadro em Colunas. Cada tela manda de volta **o que recebeu**, com
 * so os campos dela mudados: uma tela que mandasse so os campos visiveis apagaria
 * os das outras. E por isso que `published` nunca e descartado — ele e a base de
 * tudo que nao esta na tela.
 *
 * `campos` e o que a tela mexe, e e so isso que conta para "ha mudanca": comparar
 * todos diria "ha mudanca" para uma diferenca que ninguem pode ter feito ali.
 */
export function useCycleDraft(
  projectPublicId: string,
  campos: readonly (keyof CycleSettingsViewModel)[],
  mensagemSalvo: string,
) {
  const {
    data: saved,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(
      () => projectCycleSettingsService.getCycleSettings(projectPublicId),
      [projectPublicId],
    ),
  )

  const [draft, setDraft] = useState<CycleSettingsViewModel | null>(null)
  const [published, setPublished] = useState<CycleSettingsViewModel | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPublished(saved)
    setDraft(saved)
  }, [saved])

  const dirty =
    draft !== null &&
    published !== null &&
    campos.some((campo) => draft[campo] !== published[campo])

  async function salvar(): Promise<CycleSettingsViewModel | null> {
    if (!draft || !published || saving) return null

    setSaving(true)

    try {
      // A base e o que esta salvo, e por cima so os campos desta tela.
      const pedido = { ...published }
      for (const campo of campos) Object.assign(pedido, { [campo]: draft[campo] })

      const gravado = await projectCycleSettingsService.saveCycleSettings(projectPublicId, pedido)
      setPublished(gravado)
      setDraft(gravado)
      toast.done(mensagemSalvo)
      return gravado
    } catch (falha) {
      toast.error(describeError(falha))
      return null
    } finally {
      setSaving(false)
    }
  }

  return {
    draft,
    setDraft,
    published,
    loading,
    failed,
    reload,
    saving,
    dirty,
    salvar,
    descartar: () => setDraft(published),
  }
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
        <input
          id={id}
          type="number"
          min={minimo}
          max={maximo}
          value={valor}
          // Campo vazio vira o minimo, e nao `NaN`: apagar tudo para digitar outro
          // numero e o gesto comum, e `NaN` quebraria a comparacao que decide se ha o
          // que salvar. E abaixo do minimo tambem — nos prazos, zero nao e um prazo.
          onChange={(evento) => {
            const numero = Number.parseInt(evento.target.value, 10)
            aoTrocar(Number.isNaN(numero) ? minimo : Math.max(minimo, numero))
          }}
          className="h-9 w-28 rounded-lg border border-border bg-surface-raised px-3 text-body text-fg"
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
  marcado,
  titulo,
  explicacao,
  aoTrocar,
}: {
  marcado: boolean
  titulo: string
  explicacao: string
  aoTrocar: (marcado: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer gap-2.5">
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
