using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectIdentitySettingsRepository
    : BaseRepository<ProjectIdentitySettings, DataContext>, IProjectIdentitySettingsRepository
{
    public ProjectIdentitySettingsRepository(DataContext context) : base(context)
    {
    }

    public Task<ProjectIdentitySettings?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.ProjectIdentitySettings
            .FirstOrDefaultAsync(settings => settings.ProjectId == projectId, cancellationToken);

    public Task<ProjectIdentitySettings?> FindByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a da conta — o mesmo
        // desenho das regras do ciclo e da configuracao da ferramenta.
        => Context.ProjectIdentitySettings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(settings => settings.ProjectId == projectId
                                             && settings.DeletedAt == null
                                             && settings.Project.DeletedAt == null,
                cancellationToken);
}
