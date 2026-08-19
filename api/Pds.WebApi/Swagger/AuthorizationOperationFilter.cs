using Microsoft.AspNetCore.Authorization;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Pds.WebApi.Swagger;

/// <summary>
/// Marca no Swagger apenas as rotas que realmente exigem sessão, e acrescenta a
/// elas as respostas de falha de autenticação.
///
/// <para>Sem isto, o requisito de segurança é declarado uma vez para o documento
/// inteiro e o cadeado aparece até em <c>POST /auth/google</c>, que é anônima —
/// quem lê a documentação conclui que precisa de um token para conseguir o
/// primeiro token.</para>
/// </summary>
public class AuthorizationOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var method = context.MethodInfo;
        var declaringType = method.DeclaringType;

        // O que está explicitamente anônimo não exige nada, mesmo que o
        // controlador inteiro esteja marcado com [Authorize].
        var isAnonymous = method.GetCustomAttributes(true).OfType<AllowAnonymousAttribute>().Any()
                          || (declaringType?.GetCustomAttributes(true).OfType<AllowAnonymousAttribute>().Any() ?? false);

        var requiresAuth = !isAnonymous
                           && (method.GetCustomAttributes(true).OfType<AuthorizeAttribute>().Any()
                               || (declaringType?.GetCustomAttributes(true).OfType<AuthorizeAttribute>().Any() ?? false));

        if (!requiresAuth)
            return;

        operation.Security =
        [
            new OpenApiSecurityRequirement
            {
                {
                    new OpenApiSecurityScheme
                    {
                        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
                    },
                    Array.Empty<string>()
                }
            }
        ];

        operation.Responses.TryAdd("401", new OpenApiResponse { Description = "Sem sessão, ou sessão expirada." });
    }
}
