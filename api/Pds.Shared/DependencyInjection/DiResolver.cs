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

                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = signingKey,
                    ValidateIssuer = true,
                    ValidIssuer = EnvironmentConstants.GetJwtIssuer(),
                    ValidateAudience = true,
                    ValidAudience = EnvironmentConstants.GetJwtAudience(),
                    ValidateLifetime = true,

                    // Sem tolerancia de relogio: token expirado e token expirado. O
                    // padrao do .NET aceita cinco minutos a mais, o que na pratica
                    // estende toda sessao em cinco minutos silenciosamente.
                    ClockSkew = TimeSpan.Zero,
                };
            });
    }

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
    }
}
