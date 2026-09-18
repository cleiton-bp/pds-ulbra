using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectStatusMappingRepository : BaseRepository<ProjectStatusMapping, DataContext>, IProjectStatusMappingRepository
{
    public ProjectStatusMappingRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectStatusMapping>> ListByVersionAsync(long projectId, int version, CancellationToken cancellationToken = default)
        => await Context.ProjectStatusMappings
            .Where(mapping => mapping.ProjectId == projectId && mapping.Version == version)
            .ToListAsync(cancellationToken);

    public Task<bool> AnyUsingStageAsync(long projectPublicStageId, int version, CancellationToken cancellationToken = default)
        => Context.ProjectStatusMappings
            .AnyAsync(mapping => mapping.ProjectPublicStageId == projectPublicStageId
                                 && mapping.Version == version,
                cancellationToken);

    public async Task<IReadOnlyList<ProjectStatusMapping>> ListByVersionWithoutSessionAsync(long projectId, int version, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a da conta: quem
        // chega aqui ja provou que pode ver este projeto, pelo token do relato. E o
        // mesmo desenho da leitura publica da configuracao da ferramenta.
        => await Context.ProjectStatusMappings
            .IgnoreQueryFilters()
            .Where(mapping => mapping.ProjectId == projectId
                              && mapping.Version == version
                              && mapping.DeletedAt == null
                              && mapping.Project.DeletedAt == null)
            .ToListAsync(cancellationToken);
}
