using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>Os avisos de quem esta na sessao, e o e-mail de quem passou a ser responsavel.</summary>
public interface INotificationService
{
    /// <summary>Os avisos mais recentes da pessoa, dos projetos em que ela esta, e quantos nao leu.</summary>
    Task<NotificationListViewModel> ListAsync(CancellationToken cancellationToken = default);

    /// <summary>Quantos avisos a pessoa nao leu.</summary>
    Task<NotificationCountViewModel> CountUnreadAsync(CancellationToken cancellationToken = default);

    /// <summary>Marca um aviso da pessoa como lido. Ler de novo nao e erro.</summary>
    Task<NotificationCountViewModel> MarkReadAsync(Guid notificationPublicId, CancellationToken cancellationToken = default);

    /// <summary>Marca todos os avisos da pessoa como lidos.</summary>
    Task<NotificationCountViewModel> MarkAllReadAsync(CancellationToken cancellationToken = default);

    Task<NotificationSettingsViewModel> GetSettingsAsync(CancellationToken cancellationToken = default);

    Task<NotificationSettingsViewModel> SaveSettingsAsync(SaveNotificationSettingsDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Manda o e-mail de quem passou a ser responsavel. Quem chama e o consumidor da
    /// fila, sem sessao; aviso que sumiu, pessoa que desligou o e-mail ou saiu do time
    /// saem em silencio.
    /// </summary>
    Task SendAssignmentEmailAsync(Guid notificationPublicId, CancellationToken cancellationToken = default);
}
