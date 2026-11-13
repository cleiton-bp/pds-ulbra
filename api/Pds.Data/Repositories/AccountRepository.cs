using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Filters;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

/// <summary>
/// A conta e, junto, o que a exclusao dela precisa fazer no banco.
///
/// <para><b>Quase tudo aqui atravessa o filtro global</b>, e de proposito: a conta que
/// pediu exclusao tem <c>DeletedAt</c> preenchido, os projetos dela tambem, e a limpeza
/// roda fora de qualquer requisicao, sem sessao. Cada condicao que o filtro garantia esta
/// escrita a mao na propria consulta.</para>
/// </summary>
public class AccountRepository : BaseRepository<Account, DataContext>, IAccountRepository
{
    public AccountRepository(DataContext context) : base(context)
    {
    }

    public Task<Account?> FindWithoutSessionAsync(long id, CancellationToken cancellationToken = default)
        => Context.Accounts
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(account => account.Id == id, cancellationToken);

    public Task<Account?> FindByPublicIdWithoutSessionAsync(Guid publicId, CancellationToken cancellationToken = default)
        => Context.Accounts
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(account => account.PublicId == publicId, cancellationToken);

    public async Task<IReadOnlyList<Guid>> ListOverduePurgesWithoutSessionAsync(DateTime now, CancellationToken cancellationToken = default)
        => await Context.Accounts
            .IgnoreQueryFilters()
            .Where(account => account.DeletedAt != null
                              && account.AnonymizedAt == null
                              && account.PurgeAt != null
                              && account.PurgeAt <= now)
            .Select(account => account.PublicId)
            .ToListAsync(cancellationToken);

    public async Task<AccountDeletionCounts> CountForDeletionAsync(long accountId, long userId, CancellationToken cancellationToken = default)
    {
        var projetos = Context.Projects
            .IgnoreQueryFilters()
            .Where(project => project.AccountId == accountId && project.DeletedAt == null);

        var quantosProjetos = await projetos.CountAsync(cancellationToken);

        // Os apagados nao contam: ja sairam da lista do painel, e o numero no dialogo e o
        // que a pessoa reconhece do proprio trabalho.
        var relatos = await Context.Reports
            .IgnoreQueryFilters()
            .CountAsync(report => report.DeletedAt == null
                                  && projetos.Any(project => project.Id == report.ProjectId), cancellationToken);

        // Pessoas, e nao linhas: a mesma pessoa em dois projetos perde o acesso uma vez so.
        var time = await Context.ProjectMembers
            .IgnoreQueryFilters()
            .Where(member => member.DeletedAt == null
                             && member.UserId != userId
                             && projetos.Any(project => project.Id == member.ProjectId))
            .Select(member => member.UserId)
            .Distinct()
            .CountAsync(cancellationToken);

        var outros = await Context.ProjectMembers
            .IgnoreQueryFilters()
            .CountAsync(member => member.DeletedAt == null
                                  && member.UserId == userId
                                  && member.Project.DeletedAt == null
                                  && member.Project.AccountId != accountId, cancellationToken);

        return new AccountDeletionCounts(quantosProjetos, relatos, time, outros);
    }

    public async Task<IReadOnlyList<ProjectTeamToNotify>> ListTeamsToNotifyAsync(long accountId, CancellationToken cancellationToken = default)
    {
        var linhas = await Context.Projects
            .IgnoreQueryFilters()
            .Where(project => project.AccountId == accountId && project.DeletedAt == null)
            .Select(project => new
            {
                project.PublicId,
                Time = Context.ProjectMembers
                    .IgnoreQueryFilters()
                    .Where(member => member.ProjectId == project.Id
                                     && member.DeletedAt == null
                                     && member.User.AccountId != accountId)
                    .Select(member => member.User.PublicId)
                    .ToList(),
            })
            .ToListAsync(cancellationToken);

        return linhas.Select(linha => new ProjectTeamToNotify(linha.PublicId, linha.Time)).ToList();
    }

    public Task TakeProjectsOfflineAsync(long accountId, DateTime at, CancellationToken cancellationToken = default)
        => Context.Projects
            .IgnoreQueryFilters()
            .Where(project => project.AccountId == accountId && project.DeletedAt == null)
            .ExecuteUpdateAsync(set => set
                .SetProperty(project => project.DeletedAt, at)
                .SetProperty(project => project.UpdatedAt, at), cancellationToken);

    public Task BringProjectsBackAsync(long accountId, DateTime at, CancellationToken cancellationToken = default)
        => Context.Projects
            .IgnoreQueryFilters()
            .Where(project => project.AccountId == accountId && project.DeletedAt == at)
            .ExecuteUpdateAsync(set => set
                .SetProperty(project => project.DeletedAt, (DateTime?)null)
                .SetProperty(project => project.UpdatedAt, DateTime.UtcNow), cancellationToken);

    public async Task<IReadOnlyList<long>> ListProjectIdsWithoutSessionAsync(long accountId, CancellationToken cancellationToken = default)
        => await Context.Projects
            .IgnoreQueryFilters()
            .Where(project => project.AccountId == accountId)
            .Select(project => project.Id)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<long>> ListReportIdsWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default)
        => await Context.Reports
            .IgnoreQueryFilters()
            .Where(report => report.ProjectId == projectId)
            .Select(report => report.Id)
            .ToListAsync(cancellationToken);

    public async Task DeleteProjectsAsync(IReadOnlyCollection<long> projectIds, CancellationToken cancellationToken = default)
    {
        if (projectIds.Count == 0)
            return;

        // O que segura o projeto sem cascata no banco. Os relatos ja sairam, entao os
        // vinculos e os avisos de card ja foram com eles; sobra o aviso do projeto (o
        // dominio novo, a pausa) e as sprints, que os cards apontavam.
        await Context.Notifications
            .IgnoreQueryFilters()
            .Where(notification => projectIds.Contains(notification.ProjectId))
            .ExecuteDeleteAsync(cancellationToken);

        await Context.CardLinks
            .IgnoreQueryFilters()
            .Where(link => projectIds.Contains(link.ProjectId))
            .ExecuteDeleteAsync(cancellationToken);

        await Context.Sprints
            .IgnoreQueryFilters()
            .Where(sprint => projectIds.Contains(sprint.ProjectId))
            .ExecuteDeleteAsync(cancellationToken);

        // Chaves, dominios, colunas, etapas, mapa, configuracoes, time, convites e codigos
        // de quem relata saem pela cascata do banco.
        await Context.Projects
            .IgnoreQueryFilters()
            .Where(project => projectIds.Contains(project.Id))
            .ExecuteDeleteAsync(cancellationToken);
    }

    public async Task AnonymizeAsync(long accountId, DateTime at, CancellationToken cancellationToken = default)
    {
        var pessoas = Context.Users
            .IgnoreQueryFilters()
            .Where(user => user.AccountId == accountId);

        // O que e so da pessoa: os avisos que ela recebia, os sons que escolheu e o lugar
        // nos times de outras contas.
        await Context.Notifications
            .IgnoreQueryFilters()
            .Where(notification => pessoas.Any(user => user.Id == notification.UserId))
            .ExecuteDeleteAsync(cancellationToken);

        await Context.UserNotificationSounds
            .IgnoreQueryFilters()
            .Where(sound => pessoas.Any(user => user.Id == sound.UserId))
            .ExecuteDeleteAsync(cancellationToken);

        await Context.ProjectMembers
            .IgnoreQueryFilters()
            .Where(member => pessoas.Any(user => user.Id == member.UserId))
            .ExecuteDeleteAsync(cancellationToken);

        // A linha da pessoa fica, porque comentarios e encerramentos em projetos de outras
        // contas apontam para ela; o que identifica sai. O identificador do Google vira um
        // valor que nenhum login produz: com ele, a mesma conta Google voltaria a esta linha.
        await Context.Database.ExecuteSqlAsync($"""
            UPDATE users
            SET name = {AccountDeletionDefaults.DeletedPersonName},
                email = NULL,
                email_verified = FALSE,
                avatar_url = NULL,
                google_subject = 'excluido:' || public_id::text,
                sessions_revoked_at = {at},
                deleted_at = {at},
                updated_at = {at}
            WHERE account_id = {accountId}
            """, cancellationToken);

        // O evento fica, porque e a contagem da pesquisa, mas sem o caminho da pagina, a
        // mesma regra de apagar um relato de vez.
        await Context.Database.ExecuteSqlAsync(
            $"UPDATE events SET payload = payload - 'route' WHERE account_id = {accountId} AND payload IS NOT NULL",
            cancellationToken);

        await Context.Accounts
            .IgnoreQueryFilters()
            .Where(account => account.Id == accountId)
            .ExecuteUpdateAsync(set => set
                .SetProperty(account => account.Name, AccountDeletionDefaults.DeletedAccountName)
                .SetProperty(account => account.AnonymizedAt, at)
                .SetProperty(account => account.UpdatedAt, at), cancellationToken);
    }
}
