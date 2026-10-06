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
            .AddJsonProtocol(options => PdsJsonOptions.Apply(options.PayloadSerializerOptions));

        // Para o aviso saber de que aba veio o pedido (o cabecalho da conexao).
        services.AddHttpContextAccessor();
        services.AddScoped<IWorkNotifier, HubWorkNotifier>();

        return services;
    }

    public static void MapPdsRealtime(this IEndpointRouteBuilder endpoints)
        => endpoints.MapHub<WorkHub>(RealtimeTicket.HubPath);
}
