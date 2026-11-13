using System.Text.Json;
using Microsoft.Extensions.Logging;
using Pds.Domain.Interfaces.ServiceInterfaces;
using RabbitMQ.Client;

namespace Pds.Workers;

/// <summary>
/// Marca a hora de olhar de novo, publicando na troca atrasada.
/// </summary>
public class RabbitMqDelayedScheduler : IDelayedScheduler
{
    private readonly RabbitMqConnection _connection;
    private readonly ILogger<RabbitMqDelayedScheduler> _logger;

    public RabbitMqDelayedScheduler(RabbitMqConnection connection, ILogger<RabbitMqDelayedScheduler> logger)
    {
        _connection = connection;
        _logger = logger;
    }

    public bool IsAvailable => true;

    public Task ScheduleAsync(DelayedCheckKind kind, Guid reportPublicId, TimeSpan delay, CancellationToken cancellationToken = default)
        => PublishAsync(new DelayedCheckMessage(kind, reportPublicId), delay, $"Relato {reportPublicId}", cancellationToken);

    public Task ScheduleAccountPurgeAsync(Guid accountPublicId, TimeSpan delay, CancellationToken cancellationToken = default)
        // O relato vai vazio: a mensagem e da conta, e o consumidor le o tipo antes de
        // escolher qual identificador usar.
        => PublishAsync(
            new DelayedCheckMessage(DelayedCheckKind.AccountPurge, Guid.Empty, accountPublicId),
            delay,
            $"Conta {accountPublicId}",
            cancellationToken);

    private async Task PublishAsync(DelayedCheckMessage message, TimeSpan delay, string alvo, CancellationToken cancellationToken)
    {
        // **O plugin le milissegundos num `int`: cerca de 24 dias, e nao mais.** A
        // espera cabe folgado no teto de uma semana, e as 24 horas da exclusao da conta
        // tambem. O prazo do pedido de informacao **nao** cabe (os dois trechos dele vao
        // a 365 dias cada), e por isso o corte aqui nao e perda: a mensagem chega no teto,
        // o consumidor ve que o prazo ainda nao venceu e remarca o que falta. Ver
        // `ReportService.ExpireInfoRequestAsync`.
        //
        // O piso em zero existe para atraso negativo, um vencimento que ja passou, nao
        // virar um numero que o plugin interprete de outro jeito.
        var milliseconds = (int)Math.Clamp(delay.TotalMilliseconds, 0, int.MaxValue);

        await using var channel = await _connection.OpenChannelAsync(cancellationToken);

        var properties = new BasicProperties
        {
            // Duravel: o agendamento precisa sobreviver a um restart do broker.
            Persistent = true,
            ContentType = "application/json",
            Headers = new Dictionary<string, object?>
            {
                [DelayedCheckQueue.DelayHeader] = milliseconds,
            },
        };

        var body = JsonSerializer.SerializeToUtf8Bytes(message);

        await channel.BasicPublishAsync(
            exchange: DelayedCheckQueue.Exchange,
            routingKey: DelayedCheckQueue.RoutingKey,
            mandatory: false,
            basicProperties: properties,
            body: body,
            cancellationToken: cancellationToken);

        _logger.LogInformation("{Alvo} agendado: {Kind} em {Delay}ms.", alvo, message.Kind, milliseconds);
    }
}
