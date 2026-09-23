import type {
  AttachmentUploadTicketViewModel,
  ConfirmAttachmentRequest,
  ConfirmedAttachmentViewModel,
  PublicAttachmentViewModel,
  PublicMediaSettingsViewModel,
  RequestAttachmentUploadRequest,
  SignedUploadViewModel,
} from '@/contracts'

/**
 * Anexo, do lado que roda **sem sessao**: o quadro dentro do site de um cliente.
 *
 * **Tres chamadas nossas e uma de fora.** Ler o que o projeto aceita, pedir a
 * permissao e confirmar passam pela nossa API; o arquivo vai direto para o
 * armazenamento, sob as regras que a API assinou.
 */
export interface PublicMediaService {
  /**
   * O que este projeto aceita receber. **`null` quando a chave nao vale ou o
   * endereco nao esta autorizado** — os mesmos dois casos da configuracao da
   * ferramenta. Falha de rede lanca.
   */
  loadMediaSettings(
    key: string,
    origin?: string | null,
  ): Promise<PublicMediaSettingsViewModel | null>

  /** Pede a permissao de gravar um arquivo num relato que ja existe. */
  requestUpload(request: RequestAttachmentUploadRequest): Promise<AttachmentUploadTicketViewModel>

  /**
   * Envia os bytes **direto para o armazenamento**, sem passar pela nossa API.
   *
   * @param onProgress De 0 a 1, conforme o envio anda.
   */
  uploadToStorage(
    signed: SignedUploadViewModel,
    file: Blob,
    onProgress?: (fraction: number) => void,
  ): Promise<void>

  /**
   * Os arquivos do relato, para quem o relatou. **Pelo protocolo e pelo token** —
   * a mesma porta do acompanhamento. Pelo codigo pessoal ainda nao ha rota.
   */
  listTrackingAttachments(trackingCode: string, token: string): Promise<PublicAttachmentViewModel[]>

  /**
   * O que da para anexar, **pela porta do link**. A pagina de acompanhamento nao
   * tem a chave publica do projeto — so o protocolo e o token do relato.
   */
  loadTrackingMediaSettings(
    trackingCode: string,
    token: string,
  ): Promise<PublicMediaSettingsViewModel>

  /** Avisa que o arquivo chegou. E aqui que a API confere os bytes. */
  confirm(request: ConfirmAttachmentRequest): Promise<ConfirmedAttachmentViewModel>
}
