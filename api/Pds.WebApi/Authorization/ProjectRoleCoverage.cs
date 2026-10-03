using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Pds.Domain.Enums;

namespace Pds.WebApi.Authorization;

/// <summary>
/// Confere, na subida, que toda rota de projeto declara o papel que exige — e que
/// o papel faz sentido para o que ela faz.
///
/// <para><b>Esquecer aqui nao abre o projeto para quem e de fora</b> — o filtro
/// global continua respondendo "nao encontrado". O que o esquecimento abriria e a
/// configuracao para quem e so membro. Por isso sao duas regras, e a API nao sobe
/// se alguma falhar:</para>
/// <list type="number">
/// <item>toda rota com <c>projects/{publicId}</c> tem
/// <see cref="RequireProjectRoleAttribute"/>, na classe ou na acao;</item>
/// <item>fora de <c>/reports</c> — a Operação, que e trabalho de membro —, toda rota
/// que muda alguma coisa exige <see cref="ProjectRoleEnum.Administrator"/>. Sem esta,
/// uma acao nova de escrita num controlador de configuração herdaria o "membro" da
/// classe sem ninguem notar.</item>
/// </list>
/// <para>A escrita de membro fora de <c>/reports</c> existe, e e declarada: a acao
/// leva <see cref="MemberWriteAttribute"/>, com o motivo. Criar etiqueta e a primeira —
/// o time cria ao etiquetar. Sem a marca, a regra continua barrando a subida.</para>
/// </summary>
public static partial class ProjectRoleCoverage
{
    private static readonly HashSet<string> ReadMethods = new(StringComparer.OrdinalIgnoreCase) { "GET", "HEAD" };

    [GeneratedRegex(@"^projects/\{publicId(:[^}]*)?\}", RegexOptions.IgnoreCase)]
    private static partial Regex ProjectRoute();

    [GeneratedRegex(@"^projects/\{publicId(:[^}]*)?\}/reports(/|$)", RegexOptions.IgnoreCase)]
    private static partial Regex OperationRoute();

    public static void EnsureEveryProjectRouteDeclaresRole(IServiceProvider services)
    {
        var actions = services.GetRequiredService<IActionDescriptorCollectionProvider>().ActionDescriptors.Items
            .OfType<ControllerActionDescriptor>()
            .Where(action => action.AttributeRouteInfo?.Template is { } template && ProjectRoute().IsMatch(template))
            .ToList();

        var withoutRole = new List<string>();
        var writesWithoutAdministrator = new List<string>();

        foreach (var action in actions)
        {
            var template = action.AttributeRouteInfo!.Template!;
            var roles = action.FilterDescriptors
                .Select(descriptor => descriptor.Filter)
                .OfType<RequireProjectRoleAttribute>()
                .Select(attribute => attribute.Role)
                .ToList();

            if (roles.Count == 0)
            {
                withoutRole.Add($"{action.ControllerName}.{action.ActionName} ({template})");
                continue;
            }

            // Acao sem verbo declarado aceita qualquer verbo — conta como escrita.
            var methods = action.EndpointMetadata.OfType<IHttpMethodMetadata>()
                .SelectMany(metadata => metadata.HttpMethods)
                .ToList();
            var writes = methods.Count == 0 || methods.Any(method => !ReadMethods.Contains(method));

            // A excecao escrita: so a acao que declara, ela mesma, que e trabalho de membro.
            var declaredMemberWrite = action.MethodInfo
                .GetCustomAttributes(typeof(MemberWriteAttribute), inherit: false)
                .Length > 0;

            if (writes && !OperationRoute().IsMatch(template) && !roles.Contains(ProjectRoleEnum.Administrator)
                && !declaredMemberWrite)
                writesWithoutAdministrator.Add($"{action.ControllerName}.{action.ActionName} ({template})");
        }

        if (withoutRole.Count > 0)
            throw new InvalidOperationException(
                "Rota de projeto sem [RequireProjectRole]: " + string.Join(", ", withoutRole) +
                ". Declare Member na classe e Administrator na acao que muda configuracao.");

        if (writesWithoutAdministrator.Count > 0)
            throw new InvalidOperationException(
                "Rota de projeto que muda configuracao sem [RequireProjectRole(Administrator)]: " +
                string.Join(", ", writesWithoutAdministrator) +
                ". Fora de /reports, toda escrita e de administrador — ou declara [MemberWrite], com o motivo.");
    }
}
