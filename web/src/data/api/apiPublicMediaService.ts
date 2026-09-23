import type {
  ApiResponse,
  AttachmentUploadTicketViewModel,
  ConfirmedAttachmentViewModel,
  PublicAttachmentViewModel,
  PublicMediaSettingsViewModel,
} from '@/contracts'
import { postPublic } from '@/data/api/publicPost'
import { environment } from '@/data/environment'
import { PanelError } from '@/data/errors'
import type { PublicMediaService } from '@/data/publicMediaService'

/**
 * Pelo mesmo motivo de `apiReportService`: **nao passa pelo `httpClient`**, e
 * nenhuma chamada daqui carrega credencial. O quadro mora na mesma origem do
 * painel, e mandar o token de quem administra a conta de dentro de uma pagina que
 * qualquer site embute seria o pior vazamento possivel.
 */
export const apiPublicMediaService: PublicMediaService = {
  loadMediaSettings: async (key, origin) => {
    const query = new URLSearchParams({ key })
    if (origin) query.set('origin', origin)

    const response = await fetch(`${environment.apiUrl}/public/media-settings?${query}`, {
      credentials: 'omit',
    }).catch(() => {
      throw new PanelError('Falha de rede ao ler o que o projeto aceita.', 0)
    })

    // As mesmas duas recusas da configuracao da ferramenta: nao e para abrir aqui.
    if (response.status === 401 || response.status === 403) return null

    const envelope = await response
      .json()
      .then((data) => data as ApiResponse<PublicMediaSettingsViewModel>)
      .catch(() => null)

    if (!response.ok || envelope?.Success === false || !envelope?.Data) {
      throw new PanelError(envelope?.Message ?? `Erro ${response.status}.`, response.status)
    }

    return envelope.Data
  },

  requestUpload: (request) =>
    postPublic<AttachmentUploadTicketViewModel>(
      '/public/reports/attachments',
      request,
      'Falha de rede ao preparar o envio do arquivo.',
    ),

  /**
   * **`XMLHttpRequest`, e nao `fetch`, e o motivo e um so: progresso de envio.**
   * O `fetch` informa o andamento da *resposta*, e nao o do corpo que sobe — e um
   * video de 20 MB em conexao de celular leva o bastante para uma barra parada
   * parecer travamento.
   *
   * **Os campos vao antes, e o arquivo por ultimo.** E exigencia do armazenamento:
   * ele le a politica assinada nos campos e so entao decide se aceita o arquivo, e
   * um arquivo antes dos campos e recusado.
   *
   * `withCredentials` fica falso, que e o padrao: nenhum cookie vai para o
   * armazenamento, e a assinatura nos campos e a unica credencial desta chamada.
   */
  uploadToStorage: (signed, file, onProgress) =>
    new Promise<void>((resolve, reject) => {
      const form = new FormData()
      for (const [nome, valor] of Object.entries(signed.Fields)) form.append(nome, valor)
      form.append('file', file)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', signed.Url)

      xhr.upload.onprogress = (evento) => {
        if (evento.lengthComputable) onProgress?.(evento.loaded / evento.total)
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1)
          resolve()
          return
        }

        // 400 aqui e quase sempre o teto: o armazenamento recusou pelo tamanho que
        // a politica assinada permite. A mensagem diz isso, em vez de um codigo.
        reject(
          new PanelError(
            xhr.status === 400
              ? 'O armazenamento recusou o arquivo. Ele pode ser maior do que o permitido.'
              : `O envio do arquivo falhou (erro ${xhr.status}).`,
            xhr.status,
          ),
        )
      }

      xhr.onerror = () => reject(new PanelError('Falha de rede ao enviar o arquivo.', 0))
      xhr.send(form)
    }),

  // `POST` para uma leitura pelo mesmo motivo do acompanhamento: o token e segredo,
  // e segredo na URL entra em log, historico e `Referer`.
  listTrackingAttachments: (trackingCode, token) =>
    postPublic<PublicAttachmentViewModel[]>(
      '/public/reports/tracking/attachments',
      { TrackingCode: trackingCode, Token: token },
      'Falha de rede ao buscar os arquivos do relato.',
    ),

  loadTrackingMediaSettings: (trackingCode, token) =>
    postPublic<PublicMediaSettingsViewModel>(
      '/public/reports/tracking/media-settings',
      { TrackingCode: trackingCode, Token: token },
      'Falha de rede ao ler o que dá para anexar.',
    ),

  confirm: (request) =>
    postPublic<ConfirmedAttachmentViewModel>(
      '/public/reports/attachments/confirm',
      request,
      'Falha de rede ao confirmar o arquivo.',
    ),
}
