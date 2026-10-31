using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Pds.Domain.Interfaces.ServiceInterfaces;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Pds.Workers;

/// <summary>
/// Quem escuta a fila de e-mail e manda montar e enviar.
///
/// <para><b>Ele nao decide nada.</b> A mensagem traz so o que montar; quem sabe se
/// ainda vale mandar — o convite pode ter sido cancelado ou reenviado depois — e o
/// servico, relendo o estado atual.</para>
///
/// <para><b>A falha do envio nao e falha daqui.</b> O servico grava que o e-mail nao
/// saiu e registra o motivo; a mensagem e confirmada, e nao ha nova tentativa
/// automatica — quem decide reenviar e o administrador, na tela. So o que da errado
/// fora do envio (o banco fora do ar) devolve a mensagem para a fila.</para>
/// </summary>
public class EmailWorker : BackgroundService
{
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(5);

    /// <summary>Quanto a descida espera o envio em curso fechar como "nao saiu".</summary>
    private static readonly TimeSpan ShutdownGrace = TimeSpan.FromSeconds(10);

    /// <summary>O pedido em curso — um so, pelo <c>BasicQos</c>. Ver <see cref="ExecuteAsync"/>.</summary>
    private Task _current = Task.CompletedTask;

    private readonly RabbitMqConnection _connection;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<EmailWorker> _logger;

    public EmailWorker(RabbitMqConnection connection, IServiceScopeFactory scopes, ILogger<EmailWorker> logger)
    {
        _connection = connection;
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Broker fora do ar na subida: a API continua de pe, e o consumidor espera a fila
        // voltar. O que ficou pendente no banco sai logo depois, no RecoverAsync.
        // A montagem inteira entra na tentativa: falhar no meio dela tambem tenta de novo.
        await _connection.OpenChannelWithRetryAsync(nameof(EmailWorker), async (channel, cancellationToken) =>
        {
            // Um por vez: e-mail e pouco, e um de cada vez mantem um so envio aberto
            // contra o servidor SMTP.
            await channel.BasicQosAsync(0, 1, global: false, cancellationToken: cancellationToken);

            var consumer = new AsyncEventingBasicConsumer(channel);
            consumer.ReceivedAsync += async (_, entrega) =>
            {
                var pedido = HandleAsync(channel, entrega, stoppingToken);
                _current = pedido;
                await pedido;
            };

            await channel.BasicConsumeAsync(
                queue: EmailQueueNames.Queue,
                autoAck: false,
                consumer: consumer,
                cancellationToken: cancellationToken);
        }, stoppingToken);

        _logger.LogInformation("Escutando {Queue}.", EmailQueueNames.Queue);

        await RecoverAsync(stoppingToken);

        // De tempos em tempos, o que ficou para tras sai de novo: o convite que a fila
        // recusou enquanto estava fora (com a API ja de pe, a reconexao do cliente nao
        // chama a recuperacao) e o pendente que nao chegou a ela. Publicar duas vezes nao
        // manda dois e-mails: o envio reserva o convite antes.
        using var relogio = new PeriodicTimer(RecoverInterval);
        try
        {
            while (await relogio.WaitForNextTickAsync(stoppingToken))
                await RecoverAsync(stoppingToken);
        }
        catch (OperationCanceledException)
        {
            // Desligando.
        }

        // Descendo: o envio em curso ja recebeu o cancelamento e esta gravando "nao
        // saiu". Sem esperar, a aplicacao sairia antes — e o convite ficaria
        // "enviando" ate a varredura de uma subida mais de dez minutos depois.
        await Task.WhenAny(_current, Task.Delay(ShutdownGrace, CancellationToken.None));
    }

    private async Task HandleAsync(IChannel channel, BasicDeliverEventArgs entrega, CancellationToken cancellationToken)
    {
        EmailJobMessage? mensagem;

        try
        {
            mensagem = JsonSerializer.Deserialize<EmailJobMessage>(entrega.Body.Span);
        }
        catch (JsonException)
        {
            _logger.LogWarning("Pedido de e-mail ilegivel descartado: {Corpo}", Encoding.UTF8.GetString(entrega.Body.Span));
            await channel.BasicAckAsync(entrega.DeliveryTag, multiple: false, cancellationToken);
            return;
        }

        if (mensagem is null || mensagem.PublicId == Guid.Empty)
        {
            await channel.BasicAckAsync(entrega.DeliveryTag, multiple: false, cancellationToken);
            return;
        }

        try
        {
            using var escopo = _scopes.CreateScope();

            switch (mensagem.Kind)
            {
                case EmailJobKind.Invitation:
                    await escopo.ServiceProvider.GetRequiredService<IProjectInvitationService>()
                        .SendEmailAsync(mensagem.PublicId, cancellationToken);
                    break;

                default:
                    // Tipo que esta versao nao conhece: confirmado e descartado.
                    // Devolver criaria um laco — a proxima entrega nao entende melhor.
                    _logger.LogWarning("Pedido de e-mail desconhecido descartado: {Kind}.", mensagem.Kind);
                    break;
            }

            await channel.BasicAckAsync(entrega.DeliveryTag, multiple: false, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // A aplicacao esta descendo, e o servico ja marcou o envio interrompido.
            // A mensagem volta para a fila; na proxima subida ela acha o convite
            // fechado como "nao saiu", e nao faz nada.
            await channel.BasicNackAsync(entrega.DeliveryTag, multiple: false, requeue: true, CancellationToken.None);
        }
        catch (Exception erro)
        {
            _logger.LogError(erro, "Falha ao processar o pedido de e-mail {PublicId}.", mensagem.PublicId);

            // Espera antes de devolver, para uma falha que se repete — o banco fora
            // do ar — nao virar um laco apertado martelando o banco.
            try
            {
                await Task.Delay(RetryDelay, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                // A aplicacao esta descendo; a mensagem continua na fila.
            }

            await channel.BasicNackAsync(entrega.DeliveryTag, multiple: false, requeue: true, CancellationToken.None);
        }
    }

    /// <summary>De quanto em quanto tempo a recuperacao roda depois da subida.</summary>
    private static readonly TimeSpan RecoverInterval = TimeSpan.FromMinutes(2);

    /// <summary>
    /// Na abertura do consumidor e a cada <see cref="RecoverInterval"/>: marca como falho
    /// o que ficou preso no meio do envio, devolve para pendente o que a fila recusou e
    /// publica de novo o que esta pendente. A fila e do broker, e o que importa esta no
    /// banco. Publicar, e nao mandar daqui, mantem um envio por vez.
    /// </summary>
    private async Task RecoverAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var escopo = _scopes.CreateScope();
            var pendentes = await escopo.ServiceProvider.GetRequiredService<IProjectInvitationService>()
                .RecoverEmailsAsync(cancellationToken);

            if (pendentes.Count == 0)
                return;

            _logger.LogWarning("{Count} e-mail(s) de convite pendentes. Publicando de novo.", pendentes.Count);

            var fila = escopo.ServiceProvider.GetRequiredService<IEmailQueue>();

            foreach (var publicId in pendentes)
                await fila.EnqueueAsync(EmailJobKind.Invitation, publicId, cancellationToken);
        }
        catch (Exception erro) when (!cancellationToken.IsCancellationRequested)
        {
            // Falhar a recuperacao nao impede o consumidor de escutar: o que vier de
            // agora em diante continua saindo. O prazo de resposta do broker estourado
            // tambem cai aqui, e nao derruba a API.
            _logger.LogError(erro, "Falha ao recuperar os e-mails pendentes.");
        }
    }
}
