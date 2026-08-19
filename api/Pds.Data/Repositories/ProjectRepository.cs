using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectRepository : BaseRepository<Project, DataContext>, IProjectRepository
{
    public ProjectRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<Project>> ListAsync(CancellationToken cancellationToken = default)
        // O filtro global ja restringe a conta da requisicao.
        => await Context.Projects
            .OrderByDescending(project => project.CreatedAt)
            .ToListAsync(cancellationToken);

    public Task<bool> NameExistsAsync(string name, long? ignoreProjectId = null, CancellationToken cancellationToken = default)
        => Context.Projects
            .Where(project => ignoreProjectId == null || project.Id != ignoreProjectId)
            // Comparacao sem diferenciar maiuscula: para quem usa, "Loja" e "loja"
            // sao o mesmo projeto, e deixar os dois existirem so gera confusao.
            .AnyAsync(project => project.Name.ToLower() == name.ToLower(), cancellationToken);
}
