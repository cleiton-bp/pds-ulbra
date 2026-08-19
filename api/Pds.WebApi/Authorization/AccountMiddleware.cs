using Microsoft.EntityFrameworkCore;
using Pds.Data.Context;
using Pds.Domain.Security;
using Pds.Service.Services;

namespace Pds.WebApi.Authorization;

/// <summary>
/// Preenche o <see cref="AccountContext"/> a partir do token ja validado. E a
/// unica porta de entrada da conta na aplicacao: dali em diante todas as consultas
/// usam este valor, nunca o corpo da requisicao.
///
/// <para>O token traz apenas os identificadores publicos, entao aqui e preciso
/// traduzi-los para as chaves internas com uma consulta. E uma ida a mais ao banco
/// por requisicao autenticada, num indice unico. O caminho alternativo seria
/// colocar o id interno no token, e ai o numero sequencial que a modelagem mantem
/// dentro de casa viajaria em toda requisicao, legivel por quem tivesse o token.</para>
///
/// <para>Requisicao anonima (login, documentacao) segue com o contexto vazio, e o
/// filtro global nao devolve nada.</para>
/// </summary>
public class AccountMiddleware
{
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
            }
        }

        await _next(context);
    }
}
