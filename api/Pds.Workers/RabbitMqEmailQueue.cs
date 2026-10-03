using System.Text.Json;
using Microsoft.Extensions.Logging;
using Pds.Domain.Interfaces.ServiceInterfaces;
using RabbitMQ.Client;

namespace Pds.Workers;

/// <summary>Publica o pedido de e-mail na fila, pela troca padrao.</summary>
public class RabbitMqEmailQueue : IEmailQueue
{
    private readonly RabbitMqConnection _connection;
    private readonly ILogger<RabbitMqEmailQueue> _logger;

    public RabbitMqEmailQueue(RabbitMqConnection connection, ILogger<RabbitMqEmailQueue> logger)
    {
        _connection = connection;
        _logger = logger;
    }

    public bool IsAvailable => true;

    public async Task EnqueueAsync(EmailJobKind kind, Guid publicId, CancellationToken cancellationToken = default)
    {
        await using var channel = await _connection.OpenChannelAsync(cancellationToken);

        var properties = new BasicProperties
        {
            // Duravel: o pedido sobrevive a um restart do broker. E, se nao
            // sobreviver, a subida reencontra o que ficou pendente no banco.
            Persistent = true,
            ContentType = "application/json",
        };

        await channel.BasicPublishAsync(
            exchange: string.Empty,
            routingKey: EmailQueueNames.Queue,
            mandatory: false,
            basicProperties: properties,
            body: JsonSerializer.SerializeToUtf8Bytes(new EmailJobMessage(kind, publicId)),
            cancellationToken: cancellationToken);

        _logger.LogInformation("E-mail na fila: {Kind} {PublicId}.", kind, publicId);
    }
}
