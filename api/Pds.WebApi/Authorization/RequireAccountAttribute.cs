using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Shared.Models;

namespace Pds.WebApi.Authorization;

/// <summary>
/// Exige que a requisicao tenha sessao com conta resolvida.
///
/// O <c>[Authorize]</c> sozinho garante que o token e valido, e nao que o usuario
/// dele ainda existe. Este filtro roda depois do middleware e cobre o intervalo
/// entre o token ter sido emitido e o usuario ter sido apagado.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = false)]
public sealed class RequireAccountAttribute : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var accountContext = context.HttpContext.RequestServices.GetRequiredService<IAccountContext>();

        if (accountContext.IsAuthenticated)
            return;

        context.Result = new ObjectResult(
            new ApiResponse<object>(Success: false, Message: "Sessao invalida ou expirada.", Data: null))
        {
            StatusCode = StatusCodes.Status401Unauthorized
        };
    }
}
