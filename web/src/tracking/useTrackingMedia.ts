import { useCallback } from 'react'
import type { PublicAttachmentViewModel, PublicMediaSettingsViewModel } from '@/contracts'
import { publicMediaService } from '@/data/publicIndex'
import { onlyUploadable } from '@/embed/attachments'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

/**
 * Os arquivos do relato e o que da para anexar na resposta e na reabertura — tudo
 * pela porta do link, e so quando ha token.
 *
 * **Sem token, nada.** Quem abriu pelo codigo pessoal ve o relato e nao os arquivos:
 * as rotas pedem o token, e essa e a terceira porta, que ficou para depois.
 *
 * **A configuracao que falha vira "nao da para anexar"**, pelo mesmo motivo do
 * quadro: sem saber os limites, o botao prometeria o que o envio recusaria. A
 * resposta e a reabertura em texto continuam funcionando.
 */
export function useTrackingMedia(code: string, token: string) {
  const temToken = token.length > 0

  const anexos = useAsyncResource(
    useCallback(
      (): Promise<PublicAttachmentViewModel[]> =>
        temToken ? publicMediaService.listTrackingAttachments(code, token) : Promise.resolve([]),
      [code, token, temToken],
    ),
  )

  const configuracao = useAsyncResource(
    useCallback(async (): Promise<PublicMediaSettingsViewModel | null> => {
      if (!temToken) return null

      try {
        const lida = await publicMediaService.loadTrackingMediaSettings(code, token)

        // Anexo ligado e algum tipo que ainda se possa enviar — imagem. Cada envio
        // olha a propria chave logo abaixo.
        const uploadable = onlyUploadable(lida)
        return lida.IsEnabled && uploadable.Kinds.length > 0 ? uploadable : null
      } catch {
        return null
      }
    }, [code, token, temToken]),
  )

  const lida = configuracao.data ?? null

  return {
    anexos: anexos.data ?? [],
    // Renova sem tirar os arquivos da tela: e o que a galeria pede quando um
    // endereco vence, e o que a resposta e a reabertura pedem depois de enviar.
    recarregar: anexos.refresh,
    /** O projeto deixa anexar ao responder o time. */
    paraResposta: lida?.AllowsOnInfoRequest ? lida : null,
    /**
     * O projeto deixa anexar ao reabrir. **Chave propria**: ha projeto que quer o
     * print da resposta e nao o da reabertura, e o contrario.
     */
    paraReabertura: lida?.AllowsOnReopen ? lida : null,
  }
}
