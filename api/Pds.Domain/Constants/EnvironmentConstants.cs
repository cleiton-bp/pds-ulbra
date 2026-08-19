namespace Pds.Domain.Constants;

/// <summary>
/// Acesso centralizado as variaveis de ambiente. Nenhum segredo fica no codigo:
/// em desenvolvimento vem do <c>Environment/.env.local</c>, em producao das
/// variaveis reais do ambiente.
///
/// O que falta e erro na subida, nao surpresa no meio da requisicao — por isso as
/// obrigatorias lancam em vez de devolver um padrao.
/// </summary>
public static class EnvironmentConstants
{
    /// <summary>String de conexao com o PostgreSQL.</summary>
    public static string GetDatabaseConnectionString() => Required("DB_CONNECTION_STRING");

    /// <summary>Chave de assinatura do JWT do painel.</summary>
    public static string GetJwtSigningKey() => Required("JWT_SIGNING_KEY");

    /// <summary>Emissor do JWT.</summary>
    public static string GetJwtIssuer()
        => Environment.GetEnvironmentVariable("JWT_ISSUER") ?? "pds";

    /// <summary>Destinatario do JWT.</summary>
    public static string GetJwtAudience()
        => Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? "pds.panel";

    /// <summary>Validade do JWT em horas. Padrao: 8.</summary>
    public static int GetJwtExpirationHours()
        => int.TryParse(Environment.GetEnvironmentVariable("JWT_EXPIRATION_HOURS"), out var hours) ? hours : 8;

    /// <summary>
    /// Client ID da aplicacao no Google. E o <c>aud</c> esperado no token que o
    /// painel envia — sem conferir isso, um token emitido para outra aplicacao
    /// qualquer seria aceito aqui.
    /// </summary>
    public static string GetGoogleClientId() => Required("GOOGLE_CLIENT_ID");

    /// <summary>Origens autorizadas no CORS do painel, separadas por virgula.</summary>
    public static string[] GetCorsAllowedOrigins()
        => (Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGINS") ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    /// <summary>
    /// Le uma variavel obrigatoria.
    ///
    /// Trata em branco como ausente de proposito. Uma variavel declarada e vazia e
    /// o caso mais comum de erro de configuracao — o arquivo tem a linha, entao
    /// parece configurado — e um teste so contra nulo deixaria passar.
    /// </summary>
    private static string Required(string name)
    {
        var value = Environment.GetEnvironmentVariable(name);

        return string.IsNullOrWhiteSpace(value)
            ? throw new InvalidOperationException($"{name} nao configurada.")
            : value;
    }
}
