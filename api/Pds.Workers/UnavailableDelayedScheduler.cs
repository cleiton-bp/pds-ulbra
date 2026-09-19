using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Workers;

/// <summary>
/// O agendador de quem nao configurou broker nenhum.
///
/// <para><b>Existe para a aplicacao subir inteira sem RabbitMQ.</b> A espera antes
/// de quem relatou ver e uma regra que o projeto liga se quiser; exigir o broker
/// na subida faria quem nunca quis a janela deixar de funcionar por causa
/// dela.</para>
///
/// <para><b>E ele nao finge que agendou.</b> <see cref="IsAvailable"/> falso e lido
/// pela configuracao do ciclo, que <b>recusa</b> gravar uma espera maior que zero —
/// entao, na pratica, ninguem chega a chamar o metodo. Se chegar, a excecao e
/// melhor do que o silencio: uma janela prometida e nunca cumprida deixa o relato
/// invisivel para sempre, e nada acusa.</para>
/// </summary>
public class UnavailableDelayedScheduler : IDelayedScheduler
{
    public bool IsAvailable => false;

    public Task ScheduleAsync(DelayedCheckKind kind, Guid reportPublicId, TimeSpan delay, CancellationToken cancellationToken = default)
        => throw new InvalidOperationException(
            "Nao ha fila configurada para agendar a espera antes de quem relatou ver.");
}
