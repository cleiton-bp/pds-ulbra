using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.Security;
using Pds.Shared.Json;

namespace Pds.WebApi.Realtime;

/// <summary>
/// O tempo real: o hub e quem manda os avisos. Mora na WebApi, e nao no registro
/// compartilhado, pela mesma razao da fila: quem hospeda as conexoes e este processo.
/// </summary>
public static class RealtimeRegistration
{
    public static IServiceCollection AddPdsRealtime(this IServiceCollection services)
    {
        // Os avisos saem no mesmo formato da API — PascalCase —, e nao no camelCase
        // padrao do SignalR: o painel le os dois do mesmo jeito.
        services.AddSignalR()
            .AddJsonProtocol(options => PdsJsonOptions.Apply(options.PayloadSerializerOptions))
            // O hub publico so recebe a inscricao, que e pequena: mensagem grande ali so pode
            // ser abuso, e cai antes de chegar ao codigo.
            .AddHubOptions<TrackingHub>(options => options.MaximumReceiveMessageSize = 4 * 1024);

        // Para o aviso saber de que aba veio o pedido (o cabecalho da conexao).
        services.AddHttpContextAccessor();
        services.AddScoped<IWorkNotifier, HubWorkNotifier>();

        // As conexoes abertas, e quem fecha as de sessao vencida ou encerrada.
        services.AddSingleton<RealtimeConnections>();

        // Quem acompanha um relato ao vivo, e o aviso que vai para essas telas.
        services.AddSingleton<LiveTracking>();
        services.AddHostedService<RealtimeSessionSweeper>();

        return services;
    }

    public static void MapPdsRealtime(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapHub<WorkHub>(RealtimeTicket.HubPath);

        // O acompanhamento ao vivo de quem relatou: sem sessao, entao com limite de conexoes
        // por endereco, alem das recusas que derrubam a conexao (ver TrackingHub).
        endpoints.MapHub<TrackingHub>(LiveTracking.HubPath)
            .RequireRateLimiting(Startup.LiveTrackingRateLimitPolicy);
    }
}
