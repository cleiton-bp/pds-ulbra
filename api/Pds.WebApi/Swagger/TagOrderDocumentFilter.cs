using Microsoft.OpenApi.Models;
using Pds.WebApi.Controllers;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Pds.WebApi.Swagger;

/// <summary>
/// Declara os grupos do Swagger com descrição e numa ordem que conta uma história:
/// entrar, ver a sessão, criar projeto, gerar chave.
///
/// <para>Sem isto o Swagger monta os grupos sozinho, em ordem alfabética e sem
/// descrição alguma — e "Chaves do projeto" apareceria antes de "Projetos", que é
/// justamente o passo anterior.</para>
/// </summary>
public class TagOrderDocumentFilter : IDocumentFilter
{
    public void Apply(OpenApiDocument document, DocumentFilterContext context)
    {
        document.Tags =
        [
            new OpenApiTag
            {
                Name = SwaggerTags.Auth,
                Description = "Entrar e sair. A única parte que funciona sem token.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.Session,
                Description = "Quem está logado e em qual conta.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.Projects,
                Description = "A unidade que o cliente configura e a que identifica de onde veio cada relato.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.ProjectKeys,
                Description = "O que liga o sistema do cliente ao nosso. A secreta é exibida uma única vez.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.ProjectOrigins,
                Description = "De onde a ferramenta pode abrir. A chave pública fica à vista no site do cliente; é esta lista que impede a cópia dela de funcionar em outro lugar.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.PublicReports,
                Description = "A entrada do relato, vinda do site do cliente. A única área que funciona sem sessão: a credencial é a chave pública, e ela só diz para onde o relato vai.",
            },
        ];
    }
}
