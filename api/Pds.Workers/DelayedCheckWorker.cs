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
/// Quem escuta a fila e manda reavaliar o relato.
///
/// <para><b>Ele nao decide nada, e e por isso que existe.</b> A mensagem traz so o
/// identificador; quem sabe o que fazer e o servico, relendo o estado <b>atual</b>.
/// Se a decisao morasse aqui, duas mensagens para o mesmo relato dariam dois
/// resultados, e desfazer um movimento exigiria cancelar uma mensagem que nao se
/// cancela.</para>
///
/// <para><b>O <c>ack</c> vem depois da gravacao, sempre.</b> Confirmar antes faria
/// uma falha no meio perder o agendamento em silencio; confirmar depois faz o
/// broker reentregar, e a reentrega e inofensiva — o servico rele o estado e, se ja
/// estiver aplicado, descarta.</para>
///
/// <para><b>Mensagem torta e confirmada e descartada.</b> Devolver para a fila o que
/// nunca vai ser entendido cria um laco infinito que consome o broker inteiro para
/// reprocessar a mesma linha quebrada.</para>
/// </summary>
public class DelayedCheckWorker : BackgroundService
{
    private readonly RabbitMqConnection _connection;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<DelayedCheckWorker> _logger;

    public DelayedCheckWorker(
        RabbitMqConnection connection,
        IServiceScopeFactory scopes,
        ILogger<DelayedCheckWorker> logger)
    {
        _connection = connection;
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var channel = await _connection.OpenChannelAsync(stoppingToken);

        // Um por vez. Nao ha ganho em paralelizar o que chega a cada movimento de
        // card, e o teto evita que um pico de vencimentos abra dezenas de
        // transacoes ao mesmo tempo contra o banco.
        await channel.BasicQosAsync(0, 1, global: false, cancellationToken: stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += async (_, entrega) => await HandleAsync(channel, entrega, stoppingToken);

        await channel.BasicConsumeAsync(
            queue: DelayedCheckQueue.Queue,
            autoAck: false,
            consumer: consumer,
            cancellationToken: stoppingToken);

        _logger.LogInformation("Escutando {Queue}.", DelayedCheckQueue.Queue);

        await RecoverAsync(stoppingToken);

        // Segura o servico de pe. O trabalho acontece no callback do consumidor.
        await Task.Delay(Timeout.Infinite, stoppingToken).ContinueWith(_ => { }, CancellationToken.None);
    }

    /// <summary>
    /// Quanto o consumidor espera antes de devolver uma mensagem que falhou.
    ///
    /// <para>Nao existe para dar tempo de a causa passar: existe para limitar a
    /// velocidade da repeticao. Segundos bastam — o que se quer evitar e o giro em
    /// vazio, e nao a proxima tentativa.</para>
    /// </summary>
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(5);

    private async Task HandleAsync(IChannel channel, BasicDeliverEventArgs entrega, CancellationToken cancellationToken)
    {
        DelayedCheckMessage? mensagem;

        try
        {
            mensagem = JsonSerializer.Deserialize<DelayedCheckMessage>(entrega.Body.Span);
        }
        catch (JsonException)
        {
            _logger.LogWarning(
                "Mensagem ilegivel descartada: {Corpo}", Encoding.UTF8.GetString(entrega.Body.Span));

            await channel.BasicAckAsync(entrega.DeliveryTag, multiple: false, cancellationToken);
            return;
        }

        if (mensagem is null || mensagem.ReportPublicId == Guid.Empty)
        {
            await channel.BasicAckAsync(entrega.DeliveryTag, multiple: false, cancellationToken);
            return;
        }

        try
        {
            // Escopo proprio por mensagem: o servico e o contexto do banco sao por
            // requisicao, e este processo nao tem requisicao nenhuma.
            using var escopo = _scopes.CreateScope();
            var relatos = escopo.ServiceProvider.GetRequiredService<IReportService>();

            // **O `switch` e a unica decisao que este arquivo toma**, e ela e sobre
            // para quem ligar — nao sobre o que fazer. O que fazer e sempre a mesma
            // coisa nos dois casos: reler o estado atual e resolver.
            switch (mensagem.Kind)
            {
                case DelayedCheckKind.PublicStage:
                    await relatos.ApplyScheduledPublicStageAsync(mensagem.ReportPublicId, cancellationToken);
                    break;

                case DelayedCheckKind.InfoRequest:
                    await relatos.ExpireInfoRequestAsync(mensagem.ReportPublicId, cancellationToken);
                    break;

                default:
                    // Tipo que esta versao nao conhece: confirmada e descartada, em
                    // vez de devolvida. Devolver criaria um laco infinito — a
                    // proxima entrega nao vai entender melhor do que esta.
                    _logger.LogWarning("Verificacao desconhecida descartada: {Kind}.", mensagem.Kind);
                    break;
            }

            await channel.BasicAckAsync(entrega.DeliveryTag, multiple: false, cancellationToken);
        }
        catch (Exception excecao)
        {
            _logger.LogError(excecao, "Falha ao reavaliar o relato {Report}.", mensagem.ReportPublicId);

            // **Espera antes de devolver, e a espera e a parte importante.** Devolver
            // na hora com uma falha que se repete — o banco fora do ar, por exemplo —
            // faz a mesma mensagem voltar em laco apertado: com `BasicQos(0, 1)` ela
            // e a unica em curso, entao o consumidor gira sozinho martelando o banco
            // e enchendo o log ate alguem perceber.
            //
            // Nao e retentativa com limite de propósito: o vencimento esta gravado no
            // banco, entao desistir nunca perde o relato — e tentar devagar para
            // sempre e melhor do que desistir e depender de uma reinicializacao.
            try
            {
                await Task.Delay(RetryDelay, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                // A aplicacao esta descendo. Devolve sem esperar: a mensagem
                // continua na fila e o vencimento continua no banco.
            }

            await channel.BasicNackAsync(entrega.DeliveryTag, multiple: false, requeue: true, CancellationToken.None);
        }
    }

    /// <summary>
    /// O que venceu e ninguem aplicou, reencontrado na subida.
    ///
    /// <para><b>Nao e varredura periodica</b>, e roda uma vez por inicializacao. E a
    /// rede embaixo do unico ponto fraco deste desenho: o que espera dentro do
    /// broker mora no armazenamento local do no, sem replicacao — perder o no perde
    /// os agendamentos, e sem isto aqueles relatos nunca apareceriam para quem os
    /// escreveu.</para>
    ///
    /// <para>Aplica direto, sem republicar: o vencimento ja passou, entao nao ha o
    /// que esperar.</para>
    /// </summary>
    private async Task RecoverAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var escopo = _scopes.CreateScope();
            var relatos = escopo.ServiceProvider.GetRequiredService<IReportService>();

            // As duas verificacoes tem a mesma rede, e por isso sao lidas juntas.
            var esperas = await relatos.ListOverdueScheduledAsync(cancellationToken);
            var prazos = await relatos.ListOverdueInfoRequestsAsync(cancellationToken);

            if (esperas.Count == 0 && prazos.Count == 0)
                return;

            _logger.LogWarning(
                "Vencidos sem aplicacao: {Esperas} espera(s) e {Prazos} prazo(s). Reavaliando na subida.",
                esperas.Count, prazos.Count);

            foreach (var reportPublicId in esperas)
            {
                using var porRelato = _scopes.CreateScope();
                var servico = porRelato.ServiceProvider.GetRequiredService<IReportService>();

                await servico.ApplyScheduledPublicStageAsync(reportPublicId, cancellationToken);
            }

            foreach (var reportPublicId in prazos)
            {
                using var porRelato = _scopes.CreateScope();
                var servico = porRelato.ServiceProvider.GetRequiredService<IReportService>();

                await servico.ExpireInfoRequestAsync(reportPublicId, cancellationToken);
            }
        }
        catch (Exception excecao)
        {
            // Falhar a recuperacao nao pode impedir o consumidor de escutar: o que
            // vier de agora em diante continua funcionando, e o atrasado espera a
            // proxima subida.
            _logger.LogError(excecao, "Falha ao reavaliar os agendamentos vencidos.");
        }
    }
}
