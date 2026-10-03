using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectTeamSettingsRepository : IBaseRepository<ProjectTeamSettings>
{
    /// <summary>A configuracao do time do projeto, ou nula se ninguem salvou nada.</summary>
    Task<ProjectTeamSettings?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default);
}
