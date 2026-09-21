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
    public const string ProjectOrigins = "Domínios autorizados";
    public const string WidgetSettings = "Ferramenta";
    public const string ProjectStates = "Estados do projeto";
    public const string ProjectPublicStages = "Etapas públicas";
    public const string ProjectStatusMappings = "Mapeamento de estados";
    public const string CycleSettings = "Regras do ciclo";

    /// <summary>Como quem relata e identificado, e quem pode ver o que ele escreveu.</summary>
    public const string IdentitySettings = "Identidade e visibilidade";
    public const string Reports = "Relatos";
    public const string ReportComments = "Comentários do relato";
    public const string PublicReports = "Relatos (público)";
    public const string PublicWidgetSettings = "Ferramenta (público)";
}
