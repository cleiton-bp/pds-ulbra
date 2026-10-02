using Microsoft.EntityFrameworkCore;
using Pds.Data.Context;
using Pds.Domain.Enums;
using Pds.Domain.Security;
using Pds.Service.Services;

namespace Pds.WebApi.Authorization;

/// <summary>
/// Preenche o <see cref="AccountContext"/> a partir do token ja validado. E a
/// unica porta de entrada do acesso na aplicacao: dali em diante todas as
/// consultas usam estes valores, nunca o corpo da requisicao.
///
/// <para>O token traz apenas os identificadores publicos, entao aqui e preciso
/// traduzi-los para as chaves internas com uma consulta. O caminho alternativo
/// seria colocar o id interno no token, e ai o numero sequencial que a modelagem
/// mantem dentro de casa viajaria em toda requisicao, legivel por quem tivesse o
/// token.</para>
///
/// <para><b>O que a pessoa enxerga e lido do banco a cada requisicao</b>, e nao
/// guardado no token: os projetos da conta propria, como dona, e os de outras
/// contas em que entrou pelo time, com o papel. Por isso quem sai de um projeto
/// perde o acesso na requisicao seguinte, sem esperar o token vencer. Sao duas
/// consultas pequenas por requisicao autenticada, ambas por indice.</para>
///
/// <para>Requisicao anonima (login, documentacao, rotas publicas) segue com o
/// contexto vazio, e o filtro global nao devolve nada.</para>
/// </summary>
public class AccountMiddleware
{
    /// <summary>
    /// Marca no SQL do log as duas leituras que montam o acesso. As leituras de
    /// painel que desligam o filtro de proposito sao estas duas e a conferencia de
    /// nome repetido (<see cref="Pds.Data.Repositories.ProjectRepository.NameCheckQueryTag"/>),
    /// todas marcadas — e com a marca da para separa-las das que nunca deveriam
    /// desligar.
    /// </summary>
    public const string AccessQueryTag = "montagem do acesso da requisicao";

    private readonly RequestDelegate _next;

    public AccountMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, AccountContext accountContext, DataContext dataContext)
    {
        if (context.User.Identity?.IsAuthenticated == true &&
            Guid.TryParse(context.User.FindFirst(TokenService.UserClaim)?.Value, out var userPublicId))
        {
            var identity = await dataContext.Users
                .AsNoTracking()
                .Where(user => user.PublicId == userPublicId)
                .Select(user => new
                {
                    user.Id,
                    user.PublicId,
                    user.AccountId,
                    AccountPublicId = user.Account.PublicId,
                })
                .FirstOrDefaultAsync(context.RequestAborted);

            // Usuario apagado depois do token emitido cai aqui: o token continua
            // com assinatura valida, mas a sessao deixa de existir.
            if (identity is not null)
            {
                accountContext.UserId = identity.Id;
                accountContext.UserPublicId = identity.PublicId;
                accountContext.AccountId = identity.AccountId;
                accountContext.AccountPublicId = identity.AccountPublicId;
                accountContext.SetProjects(await LoadProjectsAsync(dataContext, identity.Id, identity.AccountId,
                    context.RequestAborted));
            }
        }

        await _next(context);
    }

    /// <summary>
    /// Os projetos que a pessoa enxerga, com o papel em cada um.
    ///
    /// <para>As duas leituras desligam o filtro global e reescrevem as condicoes a
    /// mao: o filtro depende justamente da lista que esta sendo montada aqui, e
    /// enquanto ela esta vazia ele nao devolveria nada.</para>
    ///
    /// <para><b>O dono vence.</b> Se a pessoa for dona da conta e tambem tiver
    /// linha no time do mesmo projeto, vale o acesso de dona — a linha nao rebaixa
    /// quem manda na conta.</para>
    /// </summary>
    private static async Task<List<ProjectAccess>> LoadProjectsAsync(
        DataContext dataContext, long userId, long accountId, CancellationToken cancellationToken)
    {
        var owned = await dataContext.Projects
            .TagWith(AccessQueryTag)
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(project => project.DeletedAt == null && project.AccountId == accountId)
            .Select(project => new ProjectAccess(project.Id, project.PublicId, ProjectRoleEnum.Administrator, true))
            .ToListAsync(cancellationToken);

        var joined = await dataContext.ProjectMembers
            .TagWith(AccessQueryTag)
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(member => member.DeletedAt == null
                             && member.UserId == userId
                             && member.Project.DeletedAt == null
                             // Conta apagada leva os projetos junto; conferir aqui nao
                             // depende de a exclusao ter cascateado.
                             && member.Project.Account.DeletedAt == null
                             && member.Project.AccountId != accountId)
            .Select(member => new ProjectAccess(member.ProjectId, member.Project.PublicId, member.Role, false))
            .ToListAsync(cancellationToken);

        return owned.Concat(joined).ToList();
    }
}
