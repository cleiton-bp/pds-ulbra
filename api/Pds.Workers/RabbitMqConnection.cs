using Microsoft.Extensions.Logging;
using RabbitMQ.Client;

namespace Pds.Workers;

/// <summary>
/// A ligacao com o broker, aberta uma vez e compartilhada.
///
/// <para><b>Uma conexao por aplicacao, e um canal por uso.</b> Conexao AMQP e cara
/// de abrir e feita para durar; canal e barato e <b>nao</b> e seguro entre threads.
/// Abrir conexao por mensagem derrubaria o broker antes de o produto ter usuario;
/// compartilhar canal daria corrupcao de protocolo que aparece como mensagem
/// perdida sem erro nenhum.</para>
///
/// <para><b>A topologia e declarada aqui, e por quem publica e por quem consome.</b>
/// Declarar e idempotente, e cada lado precisa que ela exista antes de falar. Quem
/// confiasse no outro ter declarado primeiro teria um sistema cuja subida depende
/// de ordem — e ordem entre processos nao se garante.</para>
/// </summary>
public sealed class RabbitMqConnection : IAsyncDisposable
{
    private readonly string _url;
    private readonly ILogger<RabbitMqConnection> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private IConnection? _connection;

    public RabbitMqConnection(string url, ILogger<RabbitMqConnection> logger)
    {
        _url = url;
        _logger = logger;
    }

    /// <summary>
    /// Um canal novo, com a topologia ja declarada.
    ///
    /// <para>A conexao e aberta na primeira chamada, e nao na construcao: subir a
    /// aplicacao nao pode depender de o broker estar de pe naquele segundo. Quem
    /// chama trata a falha — publicar que falha deixa o vencimento gravado, e a
    /// proxima subida o reencontra.</para>
    /// </summary>
    public async Task<IChannel> OpenChannelAsync(CancellationToken cancellationToken = default)
    {
        var connection = await EnsureConnectionAsync(cancellationToken);
        var channel = await connection.CreateChannelAsync(cancellationToken: cancellationToken);

        await DeclareAsync(channel, cancellationToken);

        return channel;
    }

    /// <summary>
    /// Um canal novo, ja montado para consumir, tentando de novo ate o broker responder. E o
    /// que os consumidores usam na subida.
    ///
    /// <para><b>A recuperacao automatica do cliente so vale depois da primeira
    /// conexao.</b> Com o broker fora na subida, a primeira tentativa falhava e nada
    /// mais tentava: um consumidor derrubava a API e o outro ficava parado ate a
    /// proxima reinicializacao. Aqui o intervalo dobra a cada falha, de 2 s ate 1 min,
    /// e cada tentativa fica no registro.</para>
    ///
    /// <para><b>Qualquer erro tenta de novo, menos o desligamento.</b> O cliente lanca
    /// <c>TaskCanceledException</c> quando uma resposta do broker passa do prazo, mesmo com a
    /// API de pe; tratada como desligamento, ela derrubava a API. A montagem do consumidor
    /// (<paramref name="prepare"/>) entra na tentativa, e o canal que falhou no meio e
    /// descartado. Cada tentativa tem prazo: um broker que aceita a conexao e nunca responde
    /// deixava a primeira pendurada para sempre.</para>
    /// </summary>
    public async Task<IChannel> OpenChannelWithRetryAsync(
        string consumer, Func<IChannel, CancellationToken, Task> prepare, CancellationToken cancellationToken)
    {
        var espera = TimeSpan.FromSeconds(2);

        for (var tentativa = 1; ; tentativa++)
        {
            IChannel? channel = null;
            try
            {
                using var prazo = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                prazo.CancelAfter(AttemptTimeout);
                channel = await OpenChannelAsync(prazo.Token);
                await prepare(channel, prazo.Token);
                return channel;
            }
            catch (Exception erro) when (!cancellationToken.IsCancellationRequested)
            {
                if (channel is not null)
                    await DiscardAsync(channel);

                _logger.LogWarning(
                    "Fila indisponivel para {Consumer} (tentativa {Tentativa}): {Erro}. Nova tentativa em {Espera} s.",
                    consumer, tentativa, erro.GetType().Name, (int)espera.TotalSeconds);

                await Task.Delay(espera, cancellationToken);
                espera = TimeSpan.FromSeconds(Math.Min(espera.TotalSeconds * 2, 60));
            }
        }
    }

    /// <summary>Quanto uma tentativa de abrir e montar o canal pode levar.</summary>
    private static readonly TimeSpan AttemptTimeout = TimeSpan.FromSeconds(30);

    /// <summary>Fecha o canal que falhou no meio da montagem, sem deixar o erro dele subir.</summary>
    private static async Task DiscardAsync(IChannel channel)
    {
        try
        {
            await channel.DisposeAsync();
        }
        catch (Exception)
        {
            // O canal ja estava quebrado: o que importa e a proxima tentativa.
        }
    }

    private async Task<IConnection> EnsureConnectionAsync(CancellationToken cancellationToken)
    {
        if (_connection is { IsOpen: true })
            return _connection;

        await _gate.WaitAsync(cancellationToken);

        try
        {
            if (_connection is { IsOpen: true })
                return _connection;

            var factory = new ConnectionFactory
            {
                Uri = new Uri(_url),
                // O proprio cliente reabre o que cair, e com isso o consumidor
                // sobrevive a uma queda do broker sem ninguem reiniciar a API.
                AutomaticRecoveryEnabled = true,
                TopologyRecoveryEnabled = true,
                ClientProvidedName = "pds-api",
            };

            _connection = await factory.CreateConnectionAsync(cancellationToken);
            _logger.LogInformation("Conexao com o RabbitMQ aberta.");

            return _connection;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Declara a troca atrasada e a fila, e liga as duas.
    ///
    /// <para><b>E aqui que um servidor sem o plugin recusa.</b> O tipo
    /// <c>x-delayed-message</c> nao existe no RabbitMQ base, e a declaracao falha —
    /// o que e bom: falha alto, na primeira tentativa, em vez de aceitar a mensagem
    /// e entrega-la na hora, adiantando para quem relatou um movimento que o time
    /// ainda podia desfazer.</para>
    /// </summary>
    private static async Task DeclareAsync(IChannel channel, CancellationToken cancellationToken)
    {
        await channel.ExchangeDeclareAsync(
            exchange: DelayedCheckQueue.Exchange,
            type: "x-delayed-message",
            durable: true,
            autoDelete: false,
            arguments: new Dictionary<string, object?>
            {
                ["x-delayed-type"] = DelayedCheckQueue.ExchangeKind,
            },
            cancellationToken: cancellationToken);

        // Duravel: o que esta agendado precisa sobreviver a um restart do broker.
        await channel.QueueDeclareAsync(
            queue: DelayedCheckQueue.Queue,
            durable: true,
            exclusive: false,
            autoDelete: false,
            cancellationToken: cancellationToken);

        await channel.QueueBindAsync(
            queue: DelayedCheckQueue.Queue,
            exchange: DelayedCheckQueue.Exchange,
            routingKey: DelayedCheckQueue.RoutingKey,
            cancellationToken: cancellationToken);

        // A fila de e-mail, ligada a troca padrao pelo proprio nome — nao ha atraso
        // nem roteamento. Duravel, como a outra.
        await channel.QueueDeclareAsync(
            queue: EmailQueueNames.Queue,
            durable: true,
            exclusive: false,
            autoDelete: false,
            cancellationToken: cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        if (_connection is not null)
            await _connection.DisposeAsync();

        _gate.Dispose();
    }
}
