namespace Pds.Domain.Enums;

/// <summary>
/// Onde esta o e-mail de um convite. E o que a tela de Membros mostra ao lado do
/// convite — e o unico registro do envio: o texto do e-mail nao e guardado.
///
/// <para>No banco vira texto em snake_case (pending, sending, sent, failed).</para>
/// </summary>
public enum InvitationEmailStatusEnum
{
    /// <summary>
    /// Na fila: o convite foi gravado e o e-mail ainda nao foi tentado. Valor zero
    /// de proposito — convite novo nasce esperando o envio.
    /// </summary>
    Pending,

    /// <summary>
    /// Um consumidor pegou o convite e esta mandando. Fica aqui so durante o envio;
    /// preso aqui depois de uma queda, a subida seguinte marca como falha.
    /// </summary>
    Sending,

    /// <summary>O servidor de e-mail aceitou a mensagem.</summary>
    Sent,

    /// <summary>
    /// O e-mail nao saiu. O motivo fica registrado no log da API; a tela mostra que
    /// nao saiu e oferece reenviar. Nao ha nova tentativa automatica.
    /// </summary>
    Failed,
}
