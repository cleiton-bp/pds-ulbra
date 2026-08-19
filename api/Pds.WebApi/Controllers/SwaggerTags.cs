namespace Pds.WebApi.Controllers;

/// <summary>
/// Nomes dos grupos que o Swagger exibe.
///
/// Ficam numa constante porque o nome aparece em dois lugares — no
/// <c>[Tags]</c> do controlador e na descrição declarada no <c>Startup</c> — e um
/// erro de digitação entre os dois cria um grupo duplicado, sem descrição, sem
/// nenhum erro de compilação.
/// </summary>
public static class SwaggerTags
{
    public const string Auth = "Autenticação";
    public const string Session = "Sessão";
    public const string Projects = "Projetos";
    public const string ProjectKeys = "Chaves do projeto";
}
