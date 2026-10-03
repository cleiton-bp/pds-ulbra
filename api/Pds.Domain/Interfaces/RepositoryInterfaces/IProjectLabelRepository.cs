using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectLabelRepository : IBaseRepository<ProjectLabel>
{
    Task<IReadOnlyList<ProjectLabel>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ProjectLabel>> ListByPublicIdsAsync(long projectId, IReadOnlyCollection<Guid> publicIds, CancellationToken cancellationToken = default);

    Task<bool> NameExistsAsync(long projectId, string name, long? exceptId = null, CancellationToken cancellationToken = default);

    Task<ProjectLabel?> FindByNameAsync(long projectId, string name, CancellationToken cancellationToken = default);

    /// <summary>
    /// Trava os nomes das etiquetas do projeto ate a transacao atual terminar.
    ///
    /// <para><b>E ela que faz o nome repetido virar a mesma etiqueta</b> quando duas
    /// criacoes chegam juntas: a segunda so procura o nome depois de a primeira gravar,
    /// e o acha. So vale dentro de uma transacao (<c>InTransactionAsync</c>).</para>
    /// </summary>
    Task LockNamesAsync(long projectId, CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<long, int>> CountCardsAsync(long projectId, CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<CardColorEnum, int>> CountByColorAsync(long projectId, CancellationToken cancellationToken = default);
}
