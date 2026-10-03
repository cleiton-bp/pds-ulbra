using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Workers;

/// <summary>
/// A fila de e-mail de quem nao configurou broker nenhum.
///
/// <para><b>Nao finge que publicou.</b> <see cref="IsAvailable"/> falso e lido por
/// quem convida, que recusa antes de gravar — e a tela de Membros diz por que. Se
/// alguem chamar mesmo assim, a excecao e melhor do que um convite que "saiu" e
/// nunca chegou.</para>
/// </summary>
public class UnavailableEmailQueue : IEmailQueue
{
    public bool IsAvailable => false;

    public Task EnqueueAsync(EmailJobKind kind, Guid publicId, CancellationToken cancellationToken = default)
        => throw new InvalidOperationException("Nao ha fila configurada para mandar e-mail.");
}
