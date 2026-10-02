using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectRepository : BaseRepository<Project, DataContext>, IProjectRepository
{
    /// <summary>
    /// Marca no SQL a conferencia de nome repetido — uma das tres leituras de painel
    /// que desligam o filtro de proposito, ao lado das duas da montagem do acesso.
    /// </summary>
    public const string NameCheckQueryTag = "conferencia de nome repetido na conta";

    public ProjectRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<Project>> ListAsync(CancellationToken cancellationToken = default)
        // O filtro global ja restringe aos projetos que a pessoa enxerga.
        => await Context.Projects
            .Include(project => project.Account)
            .OrderByDescending(project => project.CreatedAt)
            .ToListAsync(cancellationToken);

    public Task<Project?> GetWithAccountAsync(Guid publicId, CancellationToken cancellationToken = default)
        => Context.Projects
            .Include(project => project.Account)
            .FirstOrDefaultAsync(project => project.PublicId == publicId, cancellationToken);

    public Task<bool> NameExistsAsync(long accountId, string name, long? ignoreProjectId = null,
        CancellationToken cancellationToken = default)
        => Context.Projects
            .TagWith(NameCheckQueryTag)
            // Atravessa o filtro de acesso e reescreve a exclusao logica a mao: o nome
            // e unico na conta inteira, inclusive entre os projetos que a pessoa nao
            // enxerga — ver a interface.
            .IgnoreQueryFilters()
            .Where(project => project.DeletedAt == null && project.AccountId == accountId)
            .Where(project => ignoreProjectId == null || project.Id != ignoreProjectId)
            // Comparacao sem diferenciar maiuscula: para quem usa, "Loja" e "loja"
            // sao o mesmo projeto, e deixar os dois existirem so gera confusao.
            .AnyAsync(project => project.Name.ToLower() == name.ToLower(), cancellationToken);
}
