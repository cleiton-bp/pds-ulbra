using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
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
                EnvironmentConstants.GetDatabaseConnectionString(),
                npgsql =>
                {
                    npgsql.MigrationsHistoryTable("__EFMigrationsHistory", "public");
                    npgsql.CommandTimeout(60);
                }));

        services.AddApiBase();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
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
