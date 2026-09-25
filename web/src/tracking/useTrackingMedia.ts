import { useCallback } from 'react'
import type { PublicAttachmentViewModel, PublicMediaSettingsViewModel } from '@/contracts'
import { publicMediaService } from '@/data/publicIndex'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

/**
 * Os arquivos do relato e o que da para anexar na resposta — os dois pela porta do
 * link, e os dois so quando ha token.
 *
 * **Sem token, nada.** Quem abriu pelo codigo pessoal ve o relato e nao os arquivos:
 * as duas rotas pedem o token, e essa e a terceira porta, que ficou para depois.
 *
 * **A configuracao que falha vira "nao da para anexar"**, pelo mesmo motivo do
 * quadro: sem saber os limites, o botao prometeria o que o envio recusaria. A
 * resposta em texto continua funcionando.
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

        // So o que vale para a resposta: anexo ligado, tipos aceitos, e o projeto
        // deixando anexar ao responder.
        return lida.IsEnabled && lida.AllowsOnInfoRequest && lida.Kinds.length > 0 ? lida : null
      } catch {
        return null
      }
    }, [code, token, temToken]),
  )

  return {
    anexos: anexos.data ?? [],
    // Renova sem tirar os arquivos da tela: e o que a galeria pede quando um
    // endereco vence, e o que a resposta pede depois de enviar um arquivo.
    recarregar: anexos.refresh,
    paraResposta: configuracao.data ?? null,
  }
}
