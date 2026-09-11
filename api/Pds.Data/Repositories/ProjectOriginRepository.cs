using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectOriginRepository : BaseRepository<ProjectOrigin, DataContext>, IProjectOriginRepository
{
    public ProjectOriginRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectOrigin>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        // Alfabetica e nao por data: a lista e consultada para conferir se um
        // endereco esta la, e procurar e mais facil do que lembrar quando entrou.
        => await Context.ProjectOrigins
            .Where(origin => origin.ProjectId == projectId)
            .OrderBy(origin => origin.Domain)
            .ToListAsync(cancellationToken);

    public Task<bool> DomainExistsAsync(long projectId, string domain, CancellationToken cancellationToken = default)
        // O dominio ja chega normalizado, entao a comparacao e exata — e a mesma
        // que o indice unico faz no banco.
        => Context.ProjectOrigins
            .AnyAsync(origin => origin.ProjectId == projectId && origin.Domain == domain, cancellationToken);

    public Task<int> CountByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.ProjectOrigins
            .CountAsync(origin => origin.ProjectId == projectId, cancellationToken);
}
