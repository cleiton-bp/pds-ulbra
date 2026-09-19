using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Pds.Domain.Constants;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Workers;

/// <summary>
/// Liga a fila, <b>se</b> houver fila.
///
/// <para><b>A ausencia do broker e um caminho previsto, e nao uma falha.</b> Sem
/// <c>RABBITMQ_URL</c> a aplicacao sobe inteira, o agendador responde que nao esta
/// disponivel, e a configuracao do ciclo recusa ligar a espera — dizendo por que.
/// Exigir o broker na subida faria um projeto que nunca quis a janela deixar de
/// funcionar por causa dela.</para>
/// </summary>
public static class WorkersRegistration
{
    public static IServiceCollection AddPdsWorkers(this IServiceCollection services)
    {
        var url = EnvironmentConstants.GetRabbitMqUrl();

        if (url is null)
        {
            services.AddSingleton<IDelayedScheduler, UnavailableDelayedScheduler>();
            return services;
        }

        services.AddSingleton(provider => new RabbitMqConnection(
            url, provider.GetRequiredService<ILogger<RabbitMqConnection>>()));

        services.AddSingleton<IDelayedScheduler, RabbitMqDelayedScheduler>();
        services.AddHostedService<DelayedCheckWorker>();

        return services;
    }
}
