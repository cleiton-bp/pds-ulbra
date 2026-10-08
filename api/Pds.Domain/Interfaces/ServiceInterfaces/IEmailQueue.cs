namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>Que e-mail o consumidor da fila deve montar.</summary>
public enum EmailJobKind
{
    /// <summary>O convite para o time de um projeto.</summary>
    Invitation,
}

/// <summary>
/// Poe um e-mail na fila para sair fora da requisicao.
///
/// <para><b>Na fila vai so o que montar, e nao o e-mail pronto.</b> O tipo e o
/// identificador; quem consome rele o estado atual e monta a mensagem na hora — o
/// mesmo desenho das verificacoes atrasadas. Mensagem duplicada nao manda duas
/// vezes, e o link do convite nunca viaja pela fila nem fica guardado nela.</para>
///
/// <para><b>Publica depois de gravar.</b> O que importa ja esta no banco quando a
/// mensagem sai; se a fila falhar, quem chama marca o envio como falho, e a subida
/// seguinte reencontra o que ficou pendente.</para>
/// </summary>
public interface IEmailQueue
{
    /// <summary>Se ha fila configurada. Sem ela, nada que dependa de e-mail sai.</summary>
    bool IsAvailable { get; }

    /// <summary>Publica o pedido de montar e mandar um e-mail.</summary>
    Task EnqueueAsync(EmailJobKind kind, Guid publicId, CancellationToken cancellationToken = default);
}
