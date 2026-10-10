using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface INotificationRepository : IBaseRepository<Notification>
{
    /// <summary>
    /// Os avisos de uma pessoa, do mais novo para o mais antigo, com quem fez, o projeto, o
    /// card e o comentario da mencao. <paramref name="unreadOnly"/> deixa so os que ela nao
    /// leu; <paramref name="before"/> comeca depois desse aviso (a hora e a chave dele) —
    /// a pagina seguinte.
    /// </summary>
    Task<IReadOnlyList<Notification>> ListForUserAsync(
        long userId,
        bool unreadOnly,
        (DateTime CreatedAt, long Id)? before,
        int take,
        CancellationToken cancellationToken = default);

    /// <summary>Quantos avisos a pessoa ainda nao leu.</summary>
    Task<int> CountUnreadAsync(long userId, CancellationToken cancellationToken = default);

    /// <summary>Um aviso da pessoa, rastreado. Nulo quando nao e dela, ou o projeto saiu do alcance.</summary>
    Task<Notification?> FindForUserAsync(long userId, Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>Marca como lidos (rastreados, sem gravar) todos os avisos da pessoa que ela ainda enxerga. Devolve quantos; quem chama confirma.</summary>
    Task<int> MarkAllReadAsync(long userId, DateTime readAt, CancellationToken cancellationToken = default);

}
