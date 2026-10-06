using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Pds.Shared.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.OpenApi.Models;
using Pds.Domain.Constants;
using Pds.Shared.DependencyInjection;
using Pds.Email;
using Pds.Storage;
using Pds.Workers;
using Pds.Shared.Json;
using Pds.WebApi.Authorization;
using Pds.WebApi.Controllers;
using Pds.WebApi.Realtime;
using Pds.WebApi.Swagger;

namespace Pds.WebApi;

public class Startup
{
    /// <summary>Limite de tentativas de login por IP.</summary>
    public const string AuthRateLimitPolicy = "auth";

    /// <summary>Limite de pedidos de envio de midia por IP. E a rota publica que gasta dinheiro.</summary>
    public const string MediaUploadRateLimitPolicy = "media-upload";

    /// <summary>Politica de CORS do painel.</summary>
    public const string PanelCorsPolicy = "panel";

    public IConfiguration Configuration { get; }

    public Startup(IConfiguration configuration)
    {
        Configuration = configuration;
    }

    /// <summary>
    /// Texto de abertura do Swagger. Fica aqui, e nao inline, porque e o primeiro
    /// contato de quem abre a API e merece caber na tela sem rolar.
    /// </summary>
    private const string ApiDescription = """
        Camada pública de acompanhamento de relatos de problemas em software.

        Conta, projetos e chaves; o relato que chega do site do cliente e a fila em
        que o time o trabalha; a jornada pública que quem relatou acompanha; o ciclo
        que fecha, com pedido de informação, confirmação e reabertura; identidade,
        visibilidade e moderação; e os anexos — imagens e arquivos. A notificação por
        e-mail está planejada.

        O tempo real da tela de Trabalho (SignalR, em `/realtime/hub`) fica fora desta
        página; aqui está o bilhete que abre a conexão, em `POST /realtime/ticket`.

        ### Como usar

        1. `POST /auth/google` devolve um `AccessToken`.
        2. Clique em **Authorize**, no alto à direita, e cole o token.
        3. As demais rotas passam a responder.

        ### O que esperar das respostas

        Toda resposta vem no mesmo envelope, com sucesso ou sem: `Success`,
        `Message`, `Data` e, nas listagens, `Total`.

        Propriedades e valores de enum em `PascalCase`. Datas em ISO-8601 UTC, com
        `Z` no fim. Identificadores são sempre GUID: o id interno nunca sai daqui.

        Projeto em que a pessoa não está responde **404**, e não 403 — dizer "existe,
        mas não é seu" já é contar que existe. O **403** fica para quem está no projeto
        e não tem o papel: a configuração é só de quem administra.

        A explicação das decisões por trás disso está na
        [documentação do projeto](/#/visao-geral).
        """;

    public void ConfigureServices(IServiceCollection services)
    {
        // As datas do sistema sao UTC e as colunas sao "timestamp without time
        // zone". Este switch alinha o Npgsql a essa escolha.
        AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

        services.AddControllers()
            .AddJsonOptions(options => PdsJsonOptions.Apply(options.JsonSerializerOptions));

        // Corpo malformado ou campo com tipo errado e barrado pelo [ApiController]
        // antes de chegar no controlador, e a resposta padrao dele e um
        // ProblemDetails — outro formato, no meio de uma API que promete um envelope
        // so. Aqui essa resposta passa a usar o mesmo envelope das demais.
        services.Configure<ApiBehaviorOptions>(options =>
        {
            options.InvalidModelStateResponseFactory = _ => new BadRequestObjectResult(
                new ApiResponse<object>(
                    Success: false,
                    Message: "Corpo da requisição ausente ou mal formado.",
                    Data: null));

            // A mensagem e fixa de proposito. As do framework vem em ingles e citam o
            // nome do parametro em C# ("The dto field is required."), o que nao ajuda
            // quem chama e expoe o interior da aplicacao. Hoje nao ha validacao por
            // atributo em DTO nenhum — o que chega aqui e sempre corpo que o
            // ASP.NET nao conseguiu ler — entao uma frase cobre todos os casos. No dia
            // em que entrar validacao por atributo, este ponto volta a listar os erros.
        });

        services.RegisterDependencies();

        // O tempo real da tela de Trabalho: o hub e os avisos depois de cada mudanca.
        services.AddPdsRealtime();

        // A fila, **se** houver fila. Sem RABBITMQ_URL a aplicacao sobe inteira, mas
        // a espera antes de quem relatou ver fica indisponivel — a configuracao do
        // ciclo recusa liga-la, dizendo por que — e o pedido de informacao nao encerra
        // sozinho no prazo: quem encerra e o consumidor da fila, que so existe com ela. Fica fora do `RegisterDependencies`
        // de proposito: quem hospeda o consumidor e este processo, e nao a camada
        // de registro compartilhada.
        services.AddPdsWorkers();

        // O armazenamento de midia, **se** houver armazenamento. Mesma escolha da
        // fila: sem as variaveis a aplicacao sobe inteira e so a midia fica
        // indisponivel. Configurado pela metade, porem, derruba na subida — nao
        // configurar e decisao, esquecer a chave e engano.
        services.AddPdsStorage();

        // O envio de e-mail, **se** houver servidor. Mesma escolha do armazenamento:
        // sem a secao Smtp a aplicacao sobe inteira e o envio responde que nao esta
        // disponivel; configurado pela metade, derruba na subida dizendo o que
        // falta.
        //
        // **So das variaveis de ambiente**, e nao do Configuration inteiro: os
        // valores vem do .env.local (Smtp__Host e as irmas), e uma secao Smtp no
        // appsettings.json ou na linha de comando nao pode valer sem ninguem ver —
        // senha de SMTP em arquivo versionado e senha vazada.
        services.AddPdsEmail(new ConfigurationBuilder().AddEnvironmentVariables().Build());

        // O endereco do painel e conferido aqui, na subida: escrito errado, viraria
        // o link quebrado de todo convite, descoberto so por quem foi convidado.
        _ = EnvironmentConstants.GetPanelUrl();

        // Limite por IP no login. O controle de verdade e o Google validar o token;
        // isto so evita que alguem fique martelando a rota.
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // Sem isto o 429 sai com corpo vazio, e quem chama recebe um numero sem
            // explicacao. Escrevendo o mesmo envelope das demais respostas, o painel
            // trata a recusa pelo caminho que ja tem.
            options.OnRejected = async (context, cancellationToken) =>
            {
                context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                context.HttpContext.Response.ContentType = "application/json; charset=utf-8";

                var body = new ApiResponse<object>(
                    Success: false,
                    Message: "Muitas tentativas. Espere um minuto e tente de novo.",
                    Data: null);

                // Serializa com as opcoes da API de proposito: WriteAsJsonAsync usa a
                // configuracao propria do pipeline HTTP, que nao e a do MVC, e sairia
                // em camelCase no meio de um contrato PascalCase.
                await context.HttpContext.Response.WriteAsync(
                    JsonSerializer.Serialize(body, PdsJsonOptions.Create()),
                    cancellationToken);
            };

            options.AddPolicy(AuthRateLimitPolicy, httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "desconhecido",
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 20,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0,
                    }));

            // Pedir permissao de envio e confirmar o envio. As duas contam na mesma
            // janela: a primeira assina espaco no balde, e a segunda le do balde — e
            // separar as duas daria a quem martela o dobro da cota.
            //
            // So a trava minima em cima da rota cara. As outras defesas contra abuso —
            // um desafio invisivel antes do envio, e avisar o cliente quando o limite
            // dispara — ficam como Planejado.
            var mediaLimit = EnvironmentConstants.GetMediaUploadRateLimitPerMinute();

            options.AddPolicy(MediaUploadRateLimitPolicy, httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "desconhecido",
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = mediaLimit,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0,
                    }));
        });

        // So as origens configuradas falam com a API pelo navegador. A lista vazia
        // significa nenhuma origem liberada, e nao todas.
        var allowedOrigins = EnvironmentConstants.GetCorsAllowedOrigins();
        services.AddCors(options => options.AddPolicy(PanelCorsPolicy, policy =>
        {
            if (allowedOrigins.Length == 0)
                return;

            policy.WithOrigins(allowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }));

        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "PDS API",
                Version = "v1",
                Description = ApiDescription,
            });

            // A ordem das tags aqui e a ordem dos grupos na tela, e nao a
            // alfabetica: entrar vem antes de criar projeto, que vem antes de gerar
            // chave.
            options.DocumentFilter<TagOrderDocumentFilter>();

            // Nome legivel para os tipos genericos em "Schemas".
            options.CustomSchemaIds(SchemaIdGenerator.Build);

            options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
            {
                Name = "Authorization",
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                In = ParameterLocation.Header,
                Description = "Informe apenas o token devolvido por POST /auth/google, sem o prefixo \"Bearer\".",
            });

            // Marca rota por rota em vez de declarar o requisito para o documento
            // inteiro: assim o cadeado nao aparece em /auth/google, que e anonima.
            options.OperationFilter<AuthorizationOperationFilter>();

            // O XML da WebApi descreve as rotas; o do Domain descreve os DTOs e os
            // view models que aparecem em "Schemas".
            foreach (var assemblyName in new[] { Assembly.GetExecutingAssembly().GetName().Name, "Pds.Domain", "Pds.Shared" })
            {
                var xmlPath = Path.Combine(AppContext.BaseDirectory, $"{assemblyName}.xml");
                if (File.Exists(xmlPath))
                    options.IncludeXmlComments(xmlPath);
            }
        });
    }

    public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
    {
        // Antes de atender qualquer pedido: rota de projeto sem papel declarado
        // deixaria um membro mudar a configuracao. Melhor nao subir.
        ProjectRoleCoverage.EnsureEveryProjectRouteDeclaresRole(app.ApplicationServices);

        // Antes de tudo: o limite por IP e o registro de quem pediu leem o IP que
        // este passo corrige. Sem proxy listado, nada muda — ver TrustedForwarding.
        if (TrustedForwarding() is { } encaminhamento)
            app.UseForwardedHeaders(encaminhamento);

        // Documentacao do projeto servida na raiz, a partir da pasta api-docs.
        // Vem antes de tudo por ser conteudo estatico: nao precisa passar por
        // autenticacao nem por limite de requisicao.
        app.UseDefaultFiles();
        app.UseStaticFiles(new StaticFileOptions
        {
            OnPrepareResponse = context =>
            {
                // Sem Cache-Control explicito, o navegador decide sozinho por quanto
                // tempo guarda o arquivo — e passa a mostrar documentacao velha depois
                // de uma edicao. Pior: em localhost varios projetos dividem a mesma
                // origem, entao um asset de outro projeto no mesmo caminho pode ser
                // reaproveitado no lugar do nosso.
                //
                // no-cache nao proibe guardar, obriga a perguntar antes de usar: com
                // o ETag, arquivo sem mudanca volta como 304 e nao paga download.
                context.Context.Response.Headers.CacheControl = "no-cache, must-revalidate";
            }
        });

        if (env.IsDevelopment())
        {
            app.UseDeveloperExceptionPage();
            app.UseSwagger();
            app.UseSwaggerUI(options =>
            {
                options.SwaggerEndpoint("/swagger/v1/swagger.json", "PDS v1");
                options.DocumentTitle = "PDS · Swagger";
                options.DisplayRequestDuration();

                // Alinha as cores do Swagger com as da documentacao do projeto: o
                // roxo padrao dele nao conversa com o resto.
                options.InjectStylesheet("/assets/css/swagger-theme.css");

                // Acrescenta na barra do Swagger o caminho de volta para a
                // documentacao. Sem isto a ida e so de ida: quem clica em "Abrir o
                // Swagger" na documentacao so volta pelo botao do navegador.
                options.InjectJavascript("/assets/js/swagger-back.js");
            });
        }
        else
        {
            app.UseHttpsRedirection();
        }

        app.UseRouting();

        // O CORS antes do limitador: a recusa por excesso sai do limitador sem passar
        // pelo que vem depois, e sem os cabecalhos do CORS o navegador esconde a
        // resposta — a tela via "falha de rede", e nunca "muitas tentativas".
        app.UseCors(PanelCorsPolicy);
        app.UseRateLimiter();

        app.UseAuthentication();
        app.UseAuthorization();

        // Depois da autenticacao, porque le o token ja validado; antes das rotas,
        // porque o filtro global do contexto depende do que ele preenche.
        app.UseMiddleware<AccountMiddleware>();

        app.UseEndpoints(endpoints =>
        {
            endpoints.MapControllers();
            endpoints.MapPdsRealtime();
        });
    }

    /// <summary>
    /// O IP de quem pede, quando a API esta atras de um proxy listado em
    /// <c>TRUSTED_PROXIES</c>; nulo quando a lista esta vazia.
    ///
    /// <para><b>Vazia, nada muda.</b> O IP e o de quem abriu a conexao, como sempre
    /// foi — e o padrao, porque aceitar o cabecalho sem saber de quem ele vem daria a
    /// quem martela uma rota um IP novo a cada pedido.</para>
    ///
    /// <para><b>So o proxy listado e acreditado, e so um salto.</b> O padrao do
    /// ASP.NET acredita no loopback; aqui ele e esvaziado, para valer so o que foi
    /// escrito. O endereco IPv4 entra tambem na forma IPv6, que e como a conexao
    /// chega quando o servidor escuta nas duas.</para>
    ///
    /// <para>O protocolo vem junto: atras de um proxy que termina o HTTPS, sem ele o
    /// redirecionamento para HTTPS mandaria de volta a quem ja esta nele.</para>
    /// </summary>
    private static ForwardedHeadersOptions? TrustedForwarding()
    {
        var lista = EnvironmentConstants.GetTrustedProxies();

        if (lista.Length == 0)
            return null;

        var options = new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
            ForwardLimit = 1,
        };

        options.KnownProxies.Clear();
        options.KnownIPNetworks.Clear();

        // `System.Net.IPNetwork` por extenso: o HttpOverrides tem um tipo de mesmo
        // nome, o antigo, que o ASP.NET deixou de usar.
        foreach (var item in lista)
        {
            // **IPv4 so na forma completa, com os quatro numeros.** O leitor de
            // enderecos aceita "10/8" como 0.0.0.0/8 e "10.0.0" como 10.0.0.0: o proxy
            // de verdade ficaria de fora da lista, e a subida seguiria como se ele
            // estivesse nela — o engano que valor invalido derrubando existe para pegar.
            var inicio = item.Split('/')[0];
            if (!IPAddress.TryParse(inicio, out var enderecoBase)
                || (enderecoBase.AddressFamily == AddressFamily.InterNetwork && enderecoBase.ToString() != inicio))
                throw new InvalidOperationException(
                    $"TRUSTED_PROXIES tem um valor que nao e endereco nem rede: \"{item}\".");

            if (item.Contains('/') && System.Net.IPNetwork.TryParse(item, out var rede))
            {
                options.KnownIPNetworks.Add(rede);

                if (rede.BaseAddress.AddressFamily == AddressFamily.InterNetwork)
                    options.KnownIPNetworks.Add(
                        new System.Net.IPNetwork(rede.BaseAddress.MapToIPv6(), rede.PrefixLength + 96));
            }
            else if (!item.Contains('/') && IPAddress.TryParse(item, out var endereco))
            {
                options.KnownProxies.Add(endereco);

                if (endereco.AddressFamily == AddressFamily.InterNetwork)
                    options.KnownProxies.Add(endereco.MapToIPv6());
            }
            else
            {
                throw new InvalidOperationException(
                    $"TRUSTED_PROXIES tem um valor que nao e endereco nem rede: \"{item}\".");
            }
        }

        return options;
    }
}
