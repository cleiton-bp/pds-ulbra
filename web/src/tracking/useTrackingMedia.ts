import { useCallback } from 'react'
import type { PublicAttachmentViewModel, PublicMediaSettingsViewModel } from '@/contracts'
import { publicMediaService } from '@/data/publicIndex'
import { onlyUploadable } from '@/embed/attachments'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import type { PersonalEntry } from '@/shared/lib/tracking'

/**
 * Os arquivos do relato e o que da para anexar na resposta e na reabertura.
 *
 * **Os arquivos se leem pelas tres portas; anexar, so pela do link.** Quem abriu
 * pelo codigo pessoal ou pela identidade do site ve os prints que mandou — ao
 * relatar, ao responder e ao reabrir —, e nao ve onde anexar: responder e reabrir
 * pedem o link, e o que da para anexar so importa a quem age.
 *
 * @param pessoal A chave e o codigo, ou a chave e o cracha, de quem abriu pela lista
 *   pessoal. Nulo quando a pagina veio pelo link.
 *
 * **A configuracao que falha vira "nao da para anexar"**, pelo mesmo motivo do
 * quadro: sem saber os limites, o botao prometeria o que o envio recusaria. A
 * resposta e a reabertura em texto continuam funcionando.
 */
export function useTrackingMedia(
  code: string,
  token: string,
  pessoal: PersonalEntry | null = null,
) {
  const temToken = token.length > 0
  const chave = pessoal?.key ?? ''
  const codigoPessoal = pessoal && 'reporterCode' in pessoal ? pessoal.reporterCode : ''
  const cracha = pessoal && 'identityToken' in pessoal ? pessoal.identityToken : ''

  const anexos = useAsyncResource(
    useCallback((): Promise<PublicAttachmentViewModel[]> => {
      if (temToken) return publicMediaService.listTrackingAttachments(code, token)

      if (chave.length > 0 && codigoPessoal.length > 0)
        return publicMediaService.listAttachmentsByReporterCode({
          Key: chave,
          Code: codigoPessoal,
          TrackingCode: code,
        })

      if (chave.length > 0 && cracha.length > 0)
        return publicMediaService.listAttachmentsByIdentity({
          Key: chave,
          IdentityToken: cracha,
          TrackingCode: code,
        })

      return Promise.resolve([])
    }, [code, token, temToken, chave, codigoPessoal, cracha]),
  )

  const configuracao = useAsyncResource(
    useCallback(async (): Promise<PublicMediaSettingsViewModel | null> => {
      if (!temToken) return null

      try {
        const lida = await publicMediaService.loadTrackingMediaSettings(code, token)

        // Anexo ligado e algum tipo que ainda se possa enviar — imagem ou arquivo. Cada envio
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
