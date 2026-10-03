using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectTeamSettingsRepository
    : BaseRepository<ProjectTeamSettings, DataContext>, IProjectTeamSettingsRepository
{
    public ProjectTeamSettingsRepository(DataContext context) : base(context)
    {
    }

    public Task<ProjectTeamSettings?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.ProjectTeamSettings
            .FirstOrDefaultAsync(settings => settings.ProjectId == projectId, cancellationToken);
}
