using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// Os arquivos que vem com um relato, do pedido de permissao ate o anexo existir.
///
/// <para><b>Sao dois passos nossos com um passo de fora no meio.</b> Pedir a
/// permissao e confirmar passam pela API; o arquivo vai direto para o
/// armazenamento, sob as regras que a API assinou.</para>
/// </summary>
public interface IReportAttachmentService
{
    /// <summary>Assina a permissao para gravar um arquivo neste relato.</summary>
    Task<AttachmentUploadTicketViewModel> RequestUploadAsync(
        RequestAttachmentUploadDto dto,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Os anexos de um relato, para o time, com endereco de leitura assinado na hora.
    /// So depois de conferir que o relato e da conta do painel.
    /// </summary>
    Task<List<PanelAttachmentViewModel>> ListForPanelAsync(
        Guid projectPublicId,
        Guid reportPublicId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Os anexos de um relato, para quem relatou, pelo protocolo e pelo token. So
    /// depois de a porta do acompanhamento aceitar os dois.
    /// </summary>
    Task<List<PublicAttachmentViewModel>> ListForTrackingAsync(
        OpenReportTrackingDto dto,
        CancellationToken cancellationToken = default);

    /// <summary>Confere os bytes que chegaram e prende o anexo ao relato.</summary>
    Task<ConfirmedAttachmentViewModel> ConfirmAsync(
        ConfirmAttachmentDto dto,
        CancellationToken cancellationToken = default);
}
