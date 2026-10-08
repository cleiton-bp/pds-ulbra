using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>Os avisos de quem esta na sessao, e o som de cada um.</summary>
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

    /// <summary>O volume e o som de cada tipo de aviso, com os de fabrica no que a pessoa nao escolheu.</summary>
    Task<NotificationSettingsViewModel> GetSettingsAsync(CancellationToken cancellationToken = default);

    /// <summary>Grava o volume e o som de cada tipo de aviso, inteiros.</summary>
    Task<NotificationSettingsViewModel> SaveSettingsAsync(SaveNotificationSettingsDto dto, CancellationToken cancellationToken = default);
}
