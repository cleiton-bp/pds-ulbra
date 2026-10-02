using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Shared.Models;

namespace Pds.WebApi.Authorization;

/// <summary>
/// Exige que a pessoa enxergue o projeto da rota, e com o papel pedido.
///
/// <para><b>Roda antes de ler o corpo.</b> E filtro de autorizacao: o membro que
/// tenta mudar a configuracao ouve "so administradores" mesmo mandando um corpo
/// invalido, e nao uma lista de erros de validacao de algo que ele nem pode
/// fazer.</para>
///
/// <para><b>Quem nao enxerga o projeto ouve 404, e nao 403</b> — o mesmo que o
/// filtro global ja respondia: dizer "existe, mas nao e seu" ja e contar que
/// existe. O 403 fica para quem esta no projeto e nao tem o papel.</para>
///
/// <para>Na classe vale para todas as acoes; na acao, soma-se ao da classe. Por
/// isso o controlador declara o minimo (<see cref="ProjectRoleEnum.Member"/>) e a
/// acao que muda configuracao acrescenta
/// <see cref="ProjectRoleEnum.Administrator"/>. Toda rota com
/// <c>projects/{publicId}</c> precisa ter um dos dois — a API nao sobe sem isso
/// (<see cref="ProjectRoleCoverage"/>).</para>
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = false)]
public sealed class RequireProjectRoleAttribute : Attribute, IAuthorizationFilter, IOrderedFilter
{
    /// <summary>Nome do valor de rota com o identificador publico do projeto.</summary>
    public const string RouteKey = "publicId";

    public const string NotFoundMessage = "Projeto nao encontrado.";
    public const string AdministratorOnlyMessage = "So administradores do projeto podem fazer isto.";

    public RequireProjectRoleAttribute(ProjectRoleEnum role)
    {
        Role = role;
    }

    /// <summary>O papel minimo para a acao.</summary>
    public ProjectRoleEnum Role { get; }

    /// <summary>
    /// Depois do <see cref="RequireAccountAttribute"/>, que responde 401 quando a
    /// sessao nao existe mais.
    /// </summary>
    public int Order => 1;

    /// <remarks>
    /// Le o projeto da <b>rota</b>, e a acao recebe o <c>publicId</c> pela ligacao
    /// de parametros. Os dois so batem porque o <c>[ApiController]</c> do
    /// <see cref="Pds.WebApi.Controllers.BaseController"/> faz o parametro vir da
    /// rota: sem ele, um campo de formulario com outro <c>publicId</c> passaria pela
    /// conferencia de um projeto e agiria em outro.
    /// </remarks>
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var account = context.HttpContext.RequestServices.GetRequiredService<IAccountContext>();

        if (!account.IsAuthenticated)
        {
            context.Result = Respond("Sessao invalida ou expirada.", StatusCodes.Status401Unauthorized);
            return;
        }

        var access = Guid.TryParse(context.RouteData.Values[RouteKey]?.ToString(), out var projectPublicId)
            ? account.FindProject(projectPublicId)
            : null;

        if (access is null)
        {
            context.Result = Respond(NotFoundMessage, StatusCodes.Status404NotFound);
            return;
        }

        if (Role == ProjectRoleEnum.Administrator && !access.IsAdministrator)
            context.Result = Respond(AdministratorOnlyMessage, StatusCodes.Status403Forbidden);
    }

    private static ObjectResult Respond(string message, int statusCode)
        => new(new ApiResponse<object>(Success: false, Message: message, Data: null)) { StatusCode = statusCode };
}
