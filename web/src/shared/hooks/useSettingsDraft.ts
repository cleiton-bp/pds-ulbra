import { useCallback, useEffect, useState } from 'react'
import type {
  CycleSettingsViewModel,
  IdentitySettingsViewModel,
  SaveWidgetSettingsRequest,
  WidgetSettingsViewModel,
} from '@/contracts'
import {
  describeError,
  projectCycleSettingsService,
  projectIdentitySettingsService,
  projectWidgetSettingsService,
} from '@/data'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { sameValue } from '@/shared/lib/factoryDefaults'

/**
 * O rascunho de **uma parte** de uma configuracao que a API grava inteira.
 *
 * A configuracao da ferramenta, a de quem relata e as regras do ciclo moram cada uma
 * num registro so, e o salvamento substitui o registro todo — mas os campos aparecem
 * em telas diferentes, pelo assunto: os textos do formulario longe do botao, a
 * confirmacao perto de quem pode ver. Cada tela mexe so nos `fields` dela.
 *
 * **Salvar le de novo antes de gravar.** A base e o que esta salvo **agora**, e por
 * cima vao so os campos da tela: uma tela aberta ha uma hora nao apaga o que outra
 * salvou nesse meio tempo. E se os proprios campos da tela mudaram la (outra pessoa
 * salvou a mesma tela), nada e gravado: a tela avisa, passa a comparar com o que esta
 * salvo agora, e o proximo Salvar e uma escolha consciente.
 *
 * `fields` e tambem o que conta para "ha mudanca": comparar todos diria "ha mudanca"
 * para uma diferenca que ninguem pode ter feito ali.
 */
export function useSettingsDraft<T extends object>({
  read,
  write,
  fields,
  savedMessage,
}: {
  /** A leitura, estavel (`useCallback`): serve a carga e a releitura antes de salvar. */
  read: () => Promise<T>
  /** Grava o registro inteiro e devolve o que ficou salvo. */
  write: (whole: T) => Promise<T>
  fields: readonly (keyof T)[]
  /** O aviso de salvo. Sem ele, quem chamou avisa — a tela que salva duas coisas avisa uma vez. */
  savedMessage?: string
}) {
  const { data: saved, loading, failed, reload } = useAsyncResource(read)

  const [draft, setDraft] = useState<T | null>(null)
  const [published, setPublished] = useState<T | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPublished(saved)
    setDraft(saved)
  }, [saved])

  // Quantos campos da tela diferem do salvo: o cabecalho diz "3 mudanças não salvas".
  const changeCount =
    draft !== null && published !== null
      ? fields.filter((campo) => !sameValue(draft[campo], published[campo])).length
      : 0
  const dirty = changeCount > 0

  const change = useCallback((patch: Partial<T>) => {
    setDraft((atual) => (atual ? { ...atual, ...patch } : atual))
  }, [])

  async function save(): Promise<T | null> {
    if (!draft || !published || saving) return null

    setSaving(true)
    try {
      const agora = await read()

      if (fields.some((campo) => !sameValue(agora[campo], published[campo]))) {
        setPublished(agora)
        toast.error(
          'Alguém salvou esta parte enquanto você editava. Confira o que mudou e salve de novo para ficar com a sua versão.',
        )
        return null
      }

      // A base e o que esta salvo agora; por cima, so os campos desta tela.
      const pedido = { ...agora }
      for (const campo of fields) Object.assign(pedido, { [campo]: draft[campo] })

      const gravado = await write(pedido)
      setPublished(gravado)
      setDraft(gravado)
      if (savedMessage) toast.done(savedMessage)
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
    change,
    published,
    loading,
    failed,
    reload,
    saving,
    dirty,
    changeCount,
    save,
    discard: () => setDraft(published),
  }
}

/** Os campos que a gravacao da ferramenta leva — todos, sempre juntos. */
export function widgetSettingsRequest(
  settings: WidgetSettingsViewModel,
): SaveWidgetSettingsRequest {
  return {
    IsEnabled: settings.IsEnabled,
    AccentColor: settings.AccentColor,
    Position: settings.Position,
    Theme: settings.Theme,
    OffsetX: settings.OffsetX,
    OffsetY: settings.OffsetY,
    LauncherIcon: settings.LauncherIcon,
    LauncherIconOnly: settings.LauncherIconOnly,
    LauncherSize: settings.LauncherSize,
    LauncherShape: settings.LauncherShape,
    LauncherTextColor: settings.LauncherTextColor,
    LauncherShadow: settings.LauncherShadow,
    MobileMode: settings.MobileMode,
    // A linha em branco nao vai: e uma pagina que ninguem escreveu.
    HiddenPaths: settings.HiddenPaths.map((caminho) => caminho.trim()).filter(Boolean),
    LauncherLabel: settings.LauncherLabel,
    Title: settings.Title,
    SuccessMessage: settings.SuccessMessage,
    SubmitLabel: settings.SubmitLabel,
    ReportTitleQuestion: settings.ReportTitleQuestion,
    ReportTitlePlaceholder: settings.ReportTitlePlaceholder,
    TypeFieldLabel: settings.TypeFieldLabel,
    MoreDetailsLabel: settings.MoreDetailsLabel,
    NameQuestion: settings.NameQuestion,
    PublicNotice: settings.PublicNotice,
    TrackingIntro: settings.TrackingIntro,
    ShowsTypeField: settings.ShowsTypeField,
    DefaultReportType: settings.DefaultReportType,
    ReportTitleMode: settings.ReportTitleMode,
  }
}

/**
 * A configuracao da ferramenta, so com os campos de uma tela: O botão, Textos do
 * formulário e Quem relata gravam o mesmo registro.
 */
export function useWidgetSettingsDraft(
  projectPublicId: string,
  fields: readonly (keyof WidgetSettingsViewModel)[],
  savedMessage?: string,
) {
  const read = useCallback(
    () => projectWidgetSettingsService.getWidgetSettings(projectPublicId),
    [projectPublicId],
  )
  const write = useCallback(
    (whole: WidgetSettingsViewModel) =>
      projectWidgetSettingsService.saveWidgetSettings(
        projectPublicId,
        widgetSettingsRequest(whole),
      ),
    [projectPublicId],
  )
  return useSettingsDraft({ read, write, fields, savedMessage })
}

/**
 * Quem relata, so com os campos de uma tela: o modo e a visibilidade em Quem relata, e
 * "perguntar o nome" em Formulário, junto da pergunta que ele liga.
 */
export function useIdentitySettingsDraft(
  projectPublicId: string,
  fields: readonly (keyof IdentitySettingsViewModel)[],
  savedMessage?: string,
) {
  const read = useCallback(
    () => projectIdentitySettingsService.getIdentitySettings(projectPublicId),
    [projectPublicId],
  )
  const write = useCallback(
    (whole: IdentitySettingsViewModel) =>
      projectIdentitySettingsService.saveIdentitySettings(projectPublicId, {
        Mode: whole.Mode,
        Visibility: whole.Visibility,
        AsksForName: whole.AsksForName,
        IdentityPublicKey: whole.IdentityPublicKey,
        IdentityTokenMaxMinutes: whole.IdentityTokenMaxMinutes,
        IdentityRequired: whole.IdentityRequired,
      }),
    [projectPublicId],
  )
  return useSettingsDraft({ read, write, fields, savedMessage })
}

/**
 * As regras do ciclo, so com os campos de uma tela: o encerramento no Ciclo, as sprints
 * em Sprints e o fim e os prazos do quadro em Colunas.
 */
export function useCycleSettingsDraft(
  projectPublicId: string,
  fields: readonly (keyof CycleSettingsViewModel)[],
  savedMessage?: string,
) {
  const read = useCallback(
    () => projectCycleSettingsService.getCycleSettings(projectPublicId),
    [projectPublicId],
  )
  const write = useCallback(
    (whole: CycleSettingsViewModel) =>
      projectCycleSettingsService.saveCycleSettings(projectPublicId, whole),
    [projectPublicId],
  )
  return useSettingsDraft({ read, write, fields, savedMessage })
}
