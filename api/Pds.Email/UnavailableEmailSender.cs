using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Email;

/// <summary>
/// O envio de quem nao configurou servidor de e-mail nenhum.
///
/// <para><b>Existe para a aplicacao subir inteira sem ele.</b> Exigir um servidor
/// SMTP na subida faria quem so quer testar o painel depender de conta em provedor
/// de e-mail.</para>
///
/// <para><b>E ele nao finge que mandou.</b> <see cref="IsAvailable"/> falso e o aviso
/// para quem depende de e-mail oferecer outro caminho. Se alguem chamar mesmo
/// assim, a excecao e melhor do que o silencio: um convite que "saiu" e nunca
/// chegou deixa as duas pontas esperando.</para>
/// </summary>
public sealed class UnavailableEmailSender : IEmailSender
{
    public bool IsAvailable => false;

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
        => throw new InvalidOperationException("Nao ha servidor de e-mail configurado.");
}
