using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectMemberRepository : BaseRepository<ProjectMember, DataContext>, IProjectMemberRepository
{
    /// <summary>
    /// Marca a consulta que atravessa o filtro de acesso, para quem le o SQL saber
    /// que e de proposito.
    /// </summary>
    public const string AcceptQueryTag = "conferencia de quem aceita um convite";

    public ProjectMemberRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectMember>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => await Context.ProjectMembers
            .AsNoTracking()
            .Include(member => member.User)
            .Where(member => member.ProjectId == projectId)
            .OrderBy(member => member.CreatedAt)
            .ThenBy(member => member.Id)
            .ToListAsync(cancellationToken);

    public Task<ProjectMember?> GetByProjectAndUserAsync(long projectId, long userId, CancellationToken cancellationToken = default)
        => Context.ProjectMembers
            .Include(member => member.User)
            .FirstOrDefaultAsync(member => member.ProjectId == projectId && member.UserId == userId, cancellationToken);

    public Task<bool> ExistsByEmailAsync(long projectId, string email, CancellationToken cancellationToken = default)
        // O e-mail chega em minusculas; o da pessoa veio do Google como veio.
        => Context.ProjectMembers
            .AnyAsync(member => member.ProjectId == projectId
                                && member.User.Email != null
                                && member.User.Email.ToLower() == email,
                cancellationToken);

    public Task<bool> ExistsWithoutSessionAsync(long projectId, long userId, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a do acesso: a pessoa
        // esta justamente entrando, e ainda nao enxerga o projeto.
        => Context.ProjectMembers
            .TagWith(AcceptQueryTag)
            .IgnoreQueryFilters()
            .AnyAsync(member => member.ProjectId == projectId
                                && member.UserId == userId
                                && member.DeletedAt == null
                                && member.Project.DeletedAt == null,
                cancellationToken);
}
