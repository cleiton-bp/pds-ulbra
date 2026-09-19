namespace Pds.Workers;

/// <summary>
/// Os nomes da topologia, escritos uma vez.
///
/// <para>Quem publica e quem consome precisam concordar em tres cadeias de texto,
/// e um erro de digitacao entre elas nao da erro em lugar nenhum: a mensagem sai,
/// nao chega, e o relato simplesmente nunca aparece para quem o escreveu. Por isso
/// as tres moram aqui, e nao em cada lado.</para>
/// </summary>
public static class DelayedCheckQueue
{
    /// <summary>
    /// A troca atrasada.
    ///
    /// <para><b>E do tipo <c>x-delayed-message</c>, que nao e do RabbitMQ base</b>:
    /// vem do plugin <c>rabbitmq_delayed_message_exchange</c>. Servidor sem o plugin
    /// recusa esta declaracao, e a recusa acontece na subida — que e onde se quer
    /// descobrir isso, e nao no primeiro movimento de um relato de verdade.</para>
    /// </summary>
    public const string Exchange = "pds.delayed-checks";

    /// <summary>O tipo que a troca atrasada imita depois que o atraso vence.</summary>
    public const string ExchangeKind = "direct";

    /// <summary>A fila que recebe o que venceu.</summary>
    public const string Queue = "pds.checks.due";

    /// <summary>A chave que liga as duas. Uma so: nao ha o que rotear aqui.</summary>
    public const string RoutingKey = "due";

    /// <summary>
    /// O cabecalho que carrega o atraso, em milissegundos. E lido pelo plugin, e
    /// por mais ninguem.
    /// </summary>
    public const string DelayHeader = "x-delay";
}
