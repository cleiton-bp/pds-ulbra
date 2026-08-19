using System.Reflection;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Pds.Shared.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.OpenApi.Models;
using Pds.Domain.Constants;
using Pds.Shared.DependencyInjection;
using Pds.Shared.Json;
using Pds.WebApi.Authorization;
using Pds.WebApi.Controllers;
using Pds.WebApi.Swagger;

namespace Pds.WebApi;

public class Startup
{
    /// <summary>Limite de tentativas de login por IP.</summary>
    public const string AuthRateLimitPolicy = "auth";

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

        Esta é a **etapa 1 — Fundação**: conta, usuário, projeto e chaves. É o que
        precisa existir antes de qualquer relato entrar. Recebimento de relato,
        etapas públicas e notificação vêm depois.

        ### Como usar

        1. `POST /auth/google` devolve um `AccessToken`.
        2. Clique em **Authorize**, no alto à direita, e cole o token.
        3. As demais rotas passam a responder.

        ### O que esperar das respostas

        Toda resposta vem no mesmo envelope, com sucesso ou sem: `Success`,
        `Message`, `Data` e, nas listagens, `Total`.

        Propriedades e valores de enum em `PascalCase`. Datas em ISO-8601 UTC, com
        `Z` no fim. Identificadores são sempre GUID: o id interno nunca sai daqui.

        Recurso de outra conta responde **404**, e não 403 — dizer "existe, mas não
        é seu" já é contar que existe.

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

        app.UseRateLimiter();
        app.UseCors(PanelCorsPolicy);

        app.UseAuthentication();
        app.UseAuthorization();

        // Depois da autenticacao, porque le o token ja validado; antes das rotas,
        // porque o filtro global do contexto depende do que ele preenche.
        app.UseMiddleware<AccountMiddleware>();

        app.UseEndpoints(endpoints => endpoints.MapControllers());
    }
}
