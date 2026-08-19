using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectRepository : IBaseRepository<Project>
{
    /// <summary>Projetos da conta atual, do mais recente para o mais antigo.</summary>
    Task<IReadOnlyList<Project>> ListAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Ja existe projeto com este nome na conta atual? Ignora o proprio projeto
    /// quando informado, para o renomear nao colidir consigo mesmo.
    /// </summary>
    Task<bool> NameExistsAsync(string name, long? ignoreProjectId = null, CancellationToken cancellationToken = default);
}
