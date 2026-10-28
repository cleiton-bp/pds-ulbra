using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Filters;
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

    public async Task<IReadOnlyList<TeamPerson>> ListTeamAsync(long projectId, long accountId, CancellationToken cancellationToken = default)
    {
        // Pelos filtros de sempre: a pessoa apagada sai dos dois lados, e a linha do time
        // so vale no projeto que a sessao enxerga.
        var donos = Context.Users
            .Where(user => user.AccountId == accountId)
            .Select(user => new { user.Id, user.PublicId });

        var doTime = Context.ProjectMembers
            .Where(member => member.ProjectId == projectId)
            .Select(member => new { member.User.Id, member.User.PublicId });

        return await donos.Union(doTime)
            .Select(pessoa => new TeamPerson(pessoa.Id, pessoa.PublicId))
            .ToListAsync(cancellationToken);
    }

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

    public async Task<IReadOnlyList<User>> ListAdministratorsWithoutSessionAsync(long projectId, long accountId, CancellationToken cancellationToken = default)
    {
        // As condicoes do filtro global reescritas a mao, menos a do acesso: a mesma
        // regra de quem administra que o middleware monta para a sessao — a conta dona
        // administra todos os projetos dela, e o time soma quem foi feito administrador.
        var donos = await Context.Users
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(user => user.AccountId == accountId && user.DeletedAt == null)
            .ToListAsync(cancellationToken);

        var doTime = await Context.ProjectMembers
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(member => member.ProjectId == projectId
                             && member.Role == ProjectRoleEnum.Administrator
                             && member.DeletedAt == null
                             && member.User.DeletedAt == null)
            .Select(member => member.User)
            .ToListAsync(cancellationToken);

        return donos.Concat(doTime).DistinctBy(user => user.Id).ToList();
    }
}
