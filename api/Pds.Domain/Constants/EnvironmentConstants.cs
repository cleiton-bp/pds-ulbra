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

    /// <summary>
    /// Endereco do RabbitMQ, como <c>amqp://usuario:senha@host:5672/</c>.
    ///
    /// <para><b>Opcional de proposito, e devolve nulo quando falta.</b> Sem ela a
    /// aplicacao sobe inteira e so a espera antes de quem relatou ver fica
    /// indisponivel — e a configuracao do ciclo recusa liga-la, dizendo por que.
    /// Exigir o broker na subida faria um projeto que nunca quis a janela deixar de
    /// funcionar por causa dela.</para>
    /// </summary>
    public static string? GetRabbitMqUrl() => Optional("RABBITMQ_URL");

    /// <summary>
    /// Endereco do armazenamento de midia, como <c>http://localhost:9000</c>.
    ///
    /// <para><b>E um endereco, e nao um provedor.</b> Nada aqui — nem o nome da
    /// variavel, nem o codigo que a le — sabe se do outro lado tem um container
    /// rodando na maquina de quem desenvolve ou um armazenamento de verdade. Trocar
    /// para outro provedor compativel com a API do S3 e trocar estas variaveis.</para>
    ///
    /// <para><b>Opcional de proposito, e devolve nulo quando falta.</b> Sem
    /// armazenamento a aplicacao sobe inteira e so a midia fica indisponivel — a
    /// configuracao do projeto recusa ligar anexo, dizendo por que. Mesma escolha
    /// do <see cref="GetRabbitMqUrl"/>.</para>
    /// </summary>
    public static string? GetMediaStorageEndpoint() => Optional("MEDIA_STORAGE_ENDPOINT");

    /// <summary>Chave de acesso do armazenamento de midia.</summary>
    public static string? GetMediaStorageAccessKey() => Optional("MEDIA_STORAGE_ACCESS_KEY");

    /// <summary>Chave secreta do armazenamento de midia.</summary>
    public static string? GetMediaStorageSecretKey() => Optional("MEDIA_STORAGE_SECRET_KEY");

    /// <summary>Balde onde a midia e gravada.</summary>
    public static string? GetMediaStorageBucket() => Optional("MEDIA_STORAGE_BUCKET");

    /// <summary>
    /// Regiao declarada na assinatura. Padrao: <c>us-east-1</c>.
    ///
    /// <para>Entra no calculo da assinatura, entao precisa bater com a que o outro
    /// lado espera. Ha provedor que ignora, ha provedor que exige a sua, e ha o que
    /// pede <c>auto</c> — por isso e configuravel, com um padrao que serve para a
    /// maioria.</para>
    /// </summary>
    public static string GetMediaStorageRegion()
        => Optional("MEDIA_STORAGE_REGION") ?? "us-east-1";

    /// <summary>
    /// Quantos minutos vale a permissao de <b>envio</b>. Padrao: 2.
    ///
    /// <para>E so o tempo de o envio comecar, e nao o de ele terminar: a permissao
    /// e conferida na abertura do pedido. Curto de proposito — uma permissao que
    /// vaza tem prazo.</para>
    /// </summary>
    public static int GetMediaStorageUploadUrlMinutes() => Minutes("MEDIA_STORAGE_UPLOAD_URL_MINUTES", 2);

    /// <summary>
    /// Quantos minutos vale a permissao de <b>leitura</b>. Padrao: 5.
    ///
    /// <para>Tempo de a pagina carregar a midia. Vazou, tem prazo — e como a
    /// permissao e gerada sob demanda a cada vez, aumentar isto so aumenta a janela
    /// de estrago, sem facilitar nada.</para>
    /// </summary>
    public static int GetMediaStorageReadUrlMinutes() => Minutes("MEDIA_STORAGE_READ_URL_MINUTES", 5);

    /// <summary>
    /// Quantos minutos vale a permissao de leitura de algo que <b>toca</b>. Padrao: 15.
    ///
    /// <para>O video e lido em pedacos enquanto toca, e cada pedaco confere a
    /// assinatura. Com a validade da imagem, pausar e voltar alguns minutos depois
    /// quebraria a reproducao no meio.</para>
    /// </summary>
    public static int GetMediaStoragePlaybackUrlMinutes() => Minutes("MEDIA_STORAGE_PLAYBACK_URL_MINUTES", 15);

    /// <summary>
    /// Quantos pedidos de envio de midia um mesmo IP faz por minuto. Padrao: 20.
    ///
    /// <para><b>E a trava da unica rota publica que gasta dinheiro.</b> As outras,
    /// marteladas, gastam processamento; esta gasta armazenamento. E o limite de
    /// arquivos do projeto nao cobre o caso sozinho: ele conta so o que foi
    /// confirmado — de proposito, para permissao pedida e nao usada nao ocupar vaga
    /// —, entao sem esta trava quem tem um protocolo pediria permissoes em serie
    /// sem confirmar nenhuma.</para>
    ///
    /// <para>Vinte cobre com folga quem anexa quatro arquivos e tenta de novo os que
    /// falharam, e para quem tenta encher o balde.</para>
    /// </summary>
    public static int GetMediaUploadRateLimitPerMinute() => PositiveInt("MEDIA_UPLOAD_RATE_LIMIT_PER_MINUTE", 20);

    /// <summary>
    /// Enderecar o balde no caminho, e nao no nome do host. Padrao: <c>true</c>.
    ///
    /// <para>Sao as duas formas que a API do S3 aceita: <c>host/balde/arquivo</c> ou
    /// <c>balde.host/arquivo</c>. A segunda depende de DNS curinga, que nem todo
    /// provedor tem — e nenhum recusa a primeira. Por isso o padrao e o caminho:
    /// funciona em todos, e quem precisar da outra forma liga a variavel.</para>
    /// </summary>
    public static bool GetMediaStorageForcePathStyle()
        => !bool.TryParse(Environment.GetEnvironmentVariable("MEDIA_STORAGE_FORCE_PATH_STYLE"), out var value) || value;

    /// <summary>Origens autorizadas no CORS do painel, separadas por virgula.</summary>
    public static string[] GetCorsAllowedOrigins()
        => (Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGINS") ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    /// <summary>
    /// Le uma quantidade de minutos, caindo no padrao quando falta ou nao e um
    /// numero positivo.
    ///
    /// <para><b>Zero e negativo caem no padrao de proposito.</b> Validade zero
    /// geraria uma permissao que ja nasce vencida, e o erro apareceria no envio de
    /// quem relata, sem nada acusando a causa.</para>
    /// </summary>
    private static int Minutes(string name, int fallback) => PositiveInt(name, fallback);

    /// <summary>
    /// Le um inteiro positivo, caindo no padrao quando falta, nao e numero, ou e
    /// zero ou negativo — zero numa trava seria trancar a rota inteira sem ninguem
    /// ter pedido.
    /// </summary>
    private static int PositiveInt(string name, int fallback)
        => int.TryParse(Optional(name), out var value) && value > 0 ? value : fallback;

    /// <summary>
    /// Le uma variavel opcional, tratando em branco como ausente.
    ///
    /// <para>Irma do <see cref="Required"/>, e pelo mesmo motivo: uma variavel
    /// declarada e vazia parece configurada, e um teste so contra nulo a deixaria
    /// passar adiante como se valesse.</para>
    /// </summary>
    private static string? Optional(string name)
    {
        var value = Environment.GetEnvironmentVariable(name);

        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

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
