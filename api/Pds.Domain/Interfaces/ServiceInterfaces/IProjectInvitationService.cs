using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// O convite para o time: o administrador convida, a pessoa aceita com o Google do
/// mesmo endereco, e o e-mail sai pela fila.
/// </summary>
public interface IProjectInvitationService
{
    /// <summary>Os convites abertos e se este servidor manda convite.</summary>
    Task<ProjectInvitationsViewModel> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Convida. Para um endereco que ja tem convite aberto, reenvia o mesmo, com o
    /// papel novo e prazo novo.
    /// </summary>
    Task<ProjectInvitationViewModel> CreateAsync(Guid projectPublicId, CreateInvitationDto dto, CancellationToken cancellationToken = default);

    /// <summary>Manda de novo, com prazo novo. O link anterior deixa de valer.</summary>
    Task<ProjectInvitationViewModel> ResendAsync(Guid projectPublicId, Guid invitationPublicId, CancellationToken cancellationToken = default);

    /// <summary>Cancela um convite aberto. O link deixa de valer.</summary>
    Task RevokeAsync(Guid projectPublicId, Guid invitationPublicId, CancellationToken cancellationToken = default);

    /// <summary>O que a pessoa logada ve ao abrir o link.</summary>
    Task<InvitationPreviewViewModel> PreviewAsync(InvitationTokenDto dto, CancellationToken cancellationToken = default);

    /// <summary>Aceita: a pessoa logada entra no time, com o papel do convite.</summary>
    Task<AcceptedInvitationViewModel> AcceptAsync(InvitationTokenDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Monta e manda o e-mail de um convite. Chamado pelo consumidor da fila, sem
    /// sessao. Nao lanca pela falha do envio: grava que nao saiu.
    /// </summary>
    Task SendEmailAsync(Guid invitationPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Na subida: marca como falho o que ficou preso no meio do envio, e devolve o
    /// que ainda esta na fila para ser publicado de novo.
    /// </summary>
    Task<IReadOnlyList<Guid>> RecoverEmailsAsync(CancellationToken cancellationToken = default);
}
