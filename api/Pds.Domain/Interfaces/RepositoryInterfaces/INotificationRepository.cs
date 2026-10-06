using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface INotificationRepository : IBaseRepository<Notification>
{
    /// <summary>Os avisos mais recentes de uma pessoa, com quem fez, o projeto e o card.</summary>
    Task<IReadOnlyList<Notification>> ListForUserAsync(long userId, int take, CancellationToken cancellationToken = default);

    /// <summary>Quantos avisos a pessoa ainda nao leu.</summary>
    Task<int> CountUnreadAsync(long userId, CancellationToken cancellationToken = default);

    /// <summary>Um aviso da pessoa, rastreado. Nulo quando nao e dela, ou o projeto saiu do alcance.</summary>
    Task<Notification?> FindForUserAsync(long userId, Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>Marca como lidos todos os avisos da pessoa que ela ainda enxerga. Devolve quantos.</summary>
    Task<int> MarkAllReadAsync(long userId, DateTime readAt, CancellationToken cancellationToken = default);

    /// <summary>
    /// O aviso de atribuicao para o e-mail, com quem recebe, quem fez, o card e o
    /// projeto — e se quem recebe ainda esta no time. Sem sessao: quem le e o
    /// consumidor da fila.
    /// </summary>
    Task<(Notification Aviso, bool AindaNoTime)?> FindForEmailWithoutSessionAsync(Guid publicId, CancellationToken cancellationToken = default);
}
