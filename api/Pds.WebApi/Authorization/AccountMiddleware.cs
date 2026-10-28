using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Pds.Data.Configurations;
using Pds.Data.Context;
using Pds.Domain.Enums;
using Pds.Domain.Security;
using Pds.Service.Services;
using Pds.Shared.Json;
using Pds.Shared.Models;

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
/// perde o acesso na requisicao seguinte, sem esperar o token vencer. E uma consulta
/// so por requisicao autenticada, por indice (ver <see cref="LoadAccessAsync"/>).</para>
///
/// <para>Requisicao anonima (login, documentacao, rotas publicas) segue com o
/// contexto vazio, e o filtro global nao devolve nada.</para>
/// </summary>
public class AccountMiddleware
{
    /// <summary>
    /// Marca no SQL do log a leitura que monta o acesso. As leituras de painel que
    /// desligam o filtro de proposito sao esta, a conferencia de nome repetido
    /// (<see cref="Pds.Data.Repositories.ProjectRepository.NameCheckQueryTag"/>) e as do
    /// aviso em tempo real (<c>HubWorkNotifier.QueryTag</c>), todas marcadas — e com a
    /// marca da para separa-las das que nunca deveriam desligar.
    /// </summary>
    public const string AccessQueryTag = "montagem do acesso da requisicao";

    /// <summary>O papel como o banco o guarda, pelo mesmo conversor do mapeamento do time.</summary>
    private static readonly SnakeCaseEnumConverter<ProjectRoleEnum> PapelNoBanco = new();

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
            var acesso = await LoadAccessAsync(dataContext, userPublicId, context.RequestAborted);

            // Usuario apagado depois do token emitido cai aqui: o token continua
            // com assinatura valida, mas a sessao deixa de existir.
            if (acesso is not null)
            {
                // Sessao encerrada: "sair" marcou um instante, e este token foi emitido antes
                // dele. Responde 401 para o painel mandar entrar de novo, em vez de seguir
                // com uma sessao que a pessoa encerrou.
                if (SessionWasRevoked(context.User, acesso.SessionsRevokedAt))
                {
                    await WriteSessionEndedAsync(context);
                    return;
                }

                accountContext.UserId = acesso.UserId;
                accountContext.UserPublicId = userPublicId;
                accountContext.AccountId = acesso.AccountId;
                accountContext.AccountPublicId = acesso.AccountPublicId;
                accountContext.SetProjects(acesso.Projects);
            }
        }

        await _next(context);
    }

    /// <summary>
    /// Quem e a pessoa do token e os projetos que ela enxerga, com o papel em cada um —
    /// numa ida so ao banco. Nulo quando a pessoa, ou a conta dela, nao existe mais.
    ///
    /// <para><b>SQL escrito a mao, e sem o filtro global</b>: o filtro depende justamente
    /// da lista que esta sendo montada aqui, e enquanto ela esta vazia ele nao devolveria
    /// nada — por isso cada exclusao logica esta escrita na propria condicao. Eram tres
    /// consultas (a pessoa, os projetos da conta, os do time): juntas, sao duas idas a
    /// menos em toda requisicao.</para>
    ///
    /// <para><b>O dono vence.</b> Se a pessoa for dona da conta e tambem tiver linha no
    /// time do mesmo projeto, vale o acesso de dona — a linha nao rebaixa quem manda na
    /// conta.</para>
    ///
    /// <para>O hub do tempo real usa a mesma leitura ao entrar num projeto: a regra de
    /// quem enxerga o que fica num lugar so.</para>
    /// </summary>
    internal static async Task<RequestAccess?> LoadAccessAsync(
        DataContext dataContext, Guid userPublicId, CancellationToken cancellationToken)
    {
        // A pessoa vem antes, numa parte so, e as duas listas partem dela: assim o banco
        // procura a pessoa uma vez, e a lista do time comeca pelas linhas dela — e nao por
        // todos os projetos, que era o que ele escolhia sem saber de quem se tratava.
        var linhas = await dataContext.Database
            .SqlQuery<LinhaDoAcesso>($"""
                WITH pessoa AS (
                    SELECT u.id, u.account_id, a.public_id AS account_public_id, u.sessions_revoked_at
                    FROM users AS u
                    JOIN accounts AS a ON a.id = u.account_id AND a.deleted_at IS NULL
                    WHERE u.public_id = {userPublicId} AND u.deleted_at IS NULL
                )
                -- Os da conta propria, como dona. Pela juncao de fora, a pessoa vem mesmo sem projeto.
                SELECT pessoa.id AS "UserId", pessoa.account_id AS "AccountId", pessoa.account_public_id AS "AccountPublicId",
                       p.id AS "ProjectId", p.public_id AS "ProjectPublicId", NULL::text AS "Role",
                       pessoa.sessions_revoked_at AS "SessionsRevokedAt"
                FROM pessoa
                LEFT JOIN projects AS p ON p.account_id = pessoa.account_id AND p.deleted_at IS NULL
                UNION ALL
                -- Os de outras contas, pelo time, com o papel. Conta apagada leva os projetos
                -- junto; conferir aqui nao depende de a exclusao ter cascateado.
                SELECT pessoa.id, pessoa.account_id, pessoa.account_public_id, p.id, p.public_id, m.role, pessoa.sessions_revoked_at
                FROM pessoa
                JOIN project_members AS m ON m.user_id = pessoa.id AND m.deleted_at IS NULL
                JOIN projects AS p ON p.id = m.project_id AND p.deleted_at IS NULL AND p.account_id <> pessoa.account_id
                JOIN accounts AS dona ON dona.id = p.account_id AND dona.deleted_at IS NULL
                """)
            .TagWith(AccessQueryTag)
            .ToListAsync(cancellationToken);

        if (linhas.Count == 0)
            return null;

        var projetos = linhas
            .Where(linha => linha.ProjectId is not null)
            .Select(linha => linha.Role is null
                ? new ProjectAccess(linha.ProjectId!.Value, linha.ProjectPublicId!.Value, ProjectRoleEnum.Administrator, true)
                : new ProjectAccess(linha.ProjectId!.Value, linha.ProjectPublicId!.Value,
                    (ProjectRoleEnum)PapelNoBanco.ConvertFromProvider(linha.Role)!, false))
            .ToList();

        var pessoa = linhas[0];
        return new RequestAccess(pessoa.UserId, pessoa.AccountId, pessoa.AccountPublicId, projetos, pessoa.SessionsRevokedAt);
    }

    /// <summary>
    /// Se o token foi emitido antes de a pessoa sair (ver <see cref="User.SessionsRevokedAt"/>).
    /// Compara o <c>iat</c> do token (em segundos) com o instante do "sair". Sem "sair", nunca
    /// e revogado; com "sair" e sem <c>iat</c> (token antigo, de antes desta mudanca), fecha a
    /// porta — melhor pedir para entrar de novo do que deixar passar.
    /// </summary>
    private static bool SessionWasRevoked(System.Security.Claims.ClaimsPrincipal user, DateTime? revokedAt)
    {
        if (revokedAt is null)
            return false;

        var iat = user.FindFirst("iat")?.Value;
        if (!long.TryParse(iat, out var emitidoEm))
            return true;

        return emitidoEm < new DateTimeOffset(DateTime.SpecifyKind(revokedAt.Value, DateTimeKind.Utc)).ToUnixTimeSeconds();
    }

    /// <summary>O 401 de sessao encerrada, no mesmo envelope das demais respostas.</summary>
    private static async Task WriteSessionEndedAsync(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        context.Response.ContentType = "application/json; charset=utf-8";
        var body = new ApiResponse<object>(Success: false, Message: "Sessao encerrada. Entre de novo.", Data: null);
        await context.Response.WriteAsync(JsonSerializer.Serialize(body, PdsJsonOptions.Create()), context.RequestAborted);
    }

    /// <summary>Uma linha da leitura do acesso: a pessoa e, quando ha, um projeto que ela enxerga. Sem papel e de dona.</summary>
    private sealed record LinhaDoAcesso(
        long UserId, long AccountId, Guid AccountPublicId, long? ProjectId, Guid? ProjectPublicId, string? Role, DateTime? SessionsRevokedAt);
}

/// <summary>A pessoa da requisicao, pelas chaves internas, e os projetos que ela enxerga.</summary>
internal sealed record RequestAccess(
    long UserId, long AccountId, Guid AccountPublicId, IReadOnlyList<ProjectAccess> Projects, DateTime? SessionsRevokedAt);
