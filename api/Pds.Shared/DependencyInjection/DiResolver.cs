using System.Data.Common;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Pds.ApiBase.Extensions;
using Pds.Data.Context;
using Pds.Data.Repositories;
using Pds.Domain.Constants;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.Security;
using Pds.Service.Security;
using Pds.Service.Services;
using Pds.Service.Limits;

namespace Pds.Shared.DependencyInjection;

/// <summary>
/// Registro central das dependencias. Fica num lugar so para que adicionar um
/// servico seja uma linha, e nao uma cacada por qual camada o registra.
/// </summary>
public static class DiResolver
{
    public static IServiceCollection RegisterDependencies(this IServiceCollection services)
    {
        services.RegisterAuthentication();
        services.RegisterPersistence();
        services.RegisterServices();

        return services;
    }

    private static void RegisterAuthentication(this IServiceCollection services)
    {
        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EnvironmentConstants.GetJwtSigningKey()));

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                // Mantem os nomes originais dos claims (uid, acc). Sem isso o
                // ASP.NET renomeia para URLs longas do padrao WS-Federation e a
                // busca por "uid" no middleware devolve nulo.
                options.MapInboundClaims = false;
                options.TokenValidationParameters = Validation(signingKey, EnvironmentConstants.GetJwtAudience());
            })
            // O bilhete do tempo real: mesma assinatura, outro destinatario. So o hub
            // usa este esquema, e so ele le o token do endereco — o navegador nao manda
            // cabecalho na conexao WebSocket. Nenhuma rota REST le o endereco, e o
            // destinatario de cada um faz o bilhete nao valer na REST e a sessao nao
            // valer no hub. Ver RealtimeTicket.
            .AddJwtBearer(RealtimeTicket.Scheme, options =>
            {
                options.MapInboundClaims = false;
                options.TokenValidationParameters = Validation(signingKey, EnvironmentConstants.GetRealtimeAudience());
                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        if (context.HttpContext.Request.Path.StartsWithSegments(RealtimeTicket.HubPath)
                            && context.Request.Query.TryGetValue("access_token", out var bilhete))
                            context.Token = bilhete;

                        return Task.CompletedTask;
                    },
                };
            });
    }

    private static TokenValidationParameters Validation(SecurityKey signingKey, string audience) => new()
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = signingKey,
        ValidateIssuer = true,
        ValidIssuer = EnvironmentConstants.GetJwtIssuer(),
        ValidateAudience = true,
        ValidAudience = audience,
        ValidateLifetime = true,

        // Sem tolerancia de relogio: token expirado e token expirado. O padrao do .NET
        // aceita cinco minutos a mais, o que na pratica estende toda sessao em cinco
        // minutos silenciosamente.
        ClockSkew = TimeSpan.Zero,
    };

    private static void RegisterPersistence(this IServiceCollection services)
    {
        services.AddDbContext<DataContext>(options =>
            options.UseNpgsql(
                WithPoolLimit(WithAutoPrepare(WithoutJit(EnvironmentConstants.GetDatabaseConnectionString()))),
                npgsql =>
                {
                    npgsql.MigrationsHistoryTable("__EFMigrationsHistory", "public");
                    npgsql.CommandTimeout(60);
                }));

        services.AddApiBase();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
    }

    /// <summary>
    /// A conexao com o JIT do Postgres desligado. O JIT compila a consulta antes de roda-la
    /// e compensa em relatorio longo; aqui, onde tudo e consulta curta, so atrasa — o
    /// backlog passava meio segundo compilando o que roda em 15 ms. Vai na conexao, e nao
    /// na configuracao do banco, para valer em qualquer provedor sem ninguem lembrar.
    /// </summary>
    private static string WithoutJit(string connectionString)
    {
        var conexao = new NpgsqlConnectionStringBuilder(connectionString);
        conexao.Options = $"{conexao.Options} -c jit=off".Trim();
        return conexao.ConnectionString;
    }

    /// <summary>Quantas consultas preparadas cada conexao guarda: as das telas do dia a dia cabem com folga.</summary>
    private const int ConsultasPreparadas = 100;

    /// <summary>
    /// A conexao com a preparacao automatica das consultas. Sem ela, o Postgres planeja cada
    /// consulta de novo a cada pedido — a da frente do card gastava mais tempo planejando do
    /// que rodando. Preparada, a consulta que se repete na mesma conexao, e quase todas se
    /// repetem (sao as mesmas telas), ja chega planejada; a que sai de uso da lugar a outra.
    ///
    /// <para><b>O que a string de conexao disser vence.</b> Num pooler que nao aceita consulta
    /// preparada — PgBouncer em modo transacao antes da 1.21, ou sem
    /// <c>max_prepared_statements</c> —, <c>Max Auto Prepare=0</c> na variavel desliga, sem
    /// mudar codigo.</para>
    /// </summary>
    private static string WithAutoPrepare(string connectionString)
    {
        if (Says(connectionString, "Max Auto Prepare", "MaxAutoPrepare"))
            return connectionString;

        var conexao = new NpgsqlConnectionStringBuilder(connectionString)
        {
            MaxAutoPrepare = ConsultasPreparadas,
            // Preparada ja na segunda vez: na primeira ela ainda pode ser so de passagem.
            AutoPrepareMinUsages = 2,
        };
        return conexao.ConnectionString;
    }

    /// <summary>Quantas conexoes cada instancia da API abre no maximo com o banco.</summary>
    private const int ConexoesPorInstancia = 20;

    /// <summary>
    /// A conexao com um teto de conexoes por instancia. O padrao do Npgsql, 100, e o limite
    /// inteiro de um Postgres comum: duas instancias — duas replicas, ou a velha e a nova
    /// durante um deploy — passavam dele, e a segunda recebia "too many clients" em quase
    /// todo pedido. Com 60 pessoas ao mesmo tempo, 20 conexoes atenderam o mesmo que 60 — o
    /// pedido que nao acha conexao livre espera a vez —, com menos memoria no banco e cauda
    /// menor.
    ///
    /// <para><b>A conta de cada ambiente:</b> instancias × este numero, mais uma folga para a
    /// migracao e o acesso manual, cabe no limite do plano do banco. Para mudar,
    /// <c>Maximum Pool Size</c> na variavel — o que ela disser vence.</para>
    /// </summary>
    private static string WithPoolLimit(string connectionString)
    {
        if (Says(connectionString, "Maximum Pool Size", "MaxPoolSize"))
            return connectionString;

        return new NpgsqlConnectionStringBuilder(connectionString) { MaxPoolSize = ConexoesPorInstancia }.ConnectionString;
    }

    /// <summary>
    /// Se a string de conexao ja diz a opcao, em qualquer das grafias que o Npgsql aceita. O
    /// construtor do proprio Npgsql nao serve para isso: ele diz que tem toda opcao que conhece.
    /// </summary>
    private static bool Says(string connectionString, params string[] grafias)
    {
        var dita = new DbConnectionStringBuilder { ConnectionString = connectionString };
        return grafias.Any(dita.ContainsKey);
    }

    private static void RegisterServices(this IServiceCollection services)
    {
        // Mesma instancia por requisicao, exposta de dois jeitos: o middleware
        // recebe a classe concreta para preencher, todo o resto recebe a interface
        // e so consegue ler.
        services.AddScoped<AccountContext>();
        services.AddScoped<IAccountContext>(provider => provider.GetRequiredService<AccountContext>());

        services.AddSingleton<ITokenService, TokenService>();
        services.AddSingleton<IGoogleIdentityValidator, GoogleIdentityValidator>();

        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IProjectService, ProjectService>();
        services.AddScoped<IProjectKeyService, ProjectKeyService>();
        services.AddScoped<IProjectOriginService, ProjectOriginService>();
        services.AddScoped<IProjectWidgetSettingsService, ProjectWidgetSettingsService>();
        services.AddScoped<IProjectStateService, ProjectStateService>();
        services.AddScoped<IProjectPriorityService, ProjectPriorityService>();
        services.AddScoped<IProjectReportTypeService, ProjectReportTypeService>();
        services.AddScoped<IProjectLabelService, ProjectLabelService>();
        services.AddScoped<IProjectPublicStageService, ProjectPublicStageService>();
        services.AddScoped<IProjectStatusMappingService, ProjectStatusMappingService>();
        services.AddScoped<IProjectCycleSettingsService, ProjectCycleSettingsService>();
        services.AddScoped<IProjectIdentitySettingsService, ProjectIdentitySettingsService>();
        services.AddScoped<IProjectMediaSettingsService, ProjectMediaSettingsService>();
        services.AddScoped<IReportAttachmentService, ReportAttachmentService>();
        services.AddScoped<IReportCommentService, ReportCommentService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<ISprintService, SprintService>();
        services.AddScoped<IReportService, ReportService>();

        // As contagens dos limites de relato moram na memoria, e precisam ser as mesmas
        // em toda requisicao: uma instancia para o processo inteiro.
        services.AddSingleton<ReportLimiter>();
        services.AddScoped<IProjectReportLimitsService, ProjectReportLimitsService>();
        services.AddScoped<IBlockedOriginReportService, BlockedOriginReportService>();
        services.AddScoped<IProjectMemberService, ProjectMemberService>();
        services.AddScoped<IProjectInvitationService, ProjectInvitationService>();
        services.AddScoped<IProjectTeamSettingsService, ProjectTeamSettingsService>();
    }
}
