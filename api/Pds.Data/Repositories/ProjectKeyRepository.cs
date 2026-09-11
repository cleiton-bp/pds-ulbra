using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectKeyRepository : BaseRepository<ProjectKey, DataContext>, IProjectKeyRepository
{
    public ProjectKeyRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectKey>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        // Inclui as revogadas: e o historico que permite investigar um incidente.
        => await Context.ProjectKeys
            .Where(key => key.ProjectId == projectId)
            .OrderByDescending(key => key.CreatedAt)
            .ToListAsync(cancellationToken);

    public Task<ProjectKey?> FindActivePublicAsync(string value, CancellationToken cancellationToken = default)
        // IgnoreQueryFilters desliga o isolamento por conta **e** o de exclusao
        // logica, entao as duas condicoes que o filtro garantia estao reescritas a
        // mao logo abaixo. Retirar qualquer uma delas faz chave revogada ou projeto
        // apagado voltarem a aceitar relato, sem nada acusar.
        => Context.ProjectKeys
            .IgnoreQueryFilters()
            .Include(key => key.Project)
            .FirstOrDefaultAsync(key => key.Value == value
                                        && key.Type == ProjectKeyTypeEnum.Public
                                        && key.RevokedAt == null
                                        && key.DeletedAt == null
                                        && key.Project.DeletedAt == null,
                cancellationToken);

    public Task<ProjectKey?> GetActiveAsync(long projectId, ProjectKeyTypeEnum type, CancellationToken cancellationToken = default)
        => Context.ProjectKeys
            .Where(key => key.ProjectId == projectId && key.Type == type && key.RevokedAt == null)
            .OrderByDescending(key => key.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
}
