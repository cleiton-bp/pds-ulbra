namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// O que se vai reavaliar quando o atraso vencer.
///
/// <para>Mora no dominio, e nao no projeto da fila: quem pede o agendamento e o
/// servico, e ele nao pode depender de um tipo que vive junto do RabbitMQ.</para>
/// </summary>
public enum DelayedCheckKind
{
    /// <summary>A espera antes de quem relatou ver o movimento do time.</summary>
    PublicStage,

    /// <summary>O prazo do pedido de informacao, que encerra o relato sem retorno.</summary>
    InfoRequest,
}

/// <summary>
/// Quem marca a hora de olhar de novo para um relato.
///
/// <para><b>Mora no dominio como interface, e a implementacao mora longe.</b> O
/// servico que move o relato nao pode conhecer RabbitMQ: no dia em que o
/// agendamento mudar de transporte — ou deixar de existir —, o que decide o
/// movimento nao pode mudar junto.</para>
///
/// <para><b>Ele nao carrega decisao nenhuma.</b> O que viaja e o identificador do
/// relato e o atraso, nada mais. Quem consome rele o estado <b>atual</b> e decide
/// ali — e e isso que faz mensagem duplicada ser inofensiva, e o desfazer
/// funcionar sem cancelar coisa alguma. Mandar a decisao junto seria congelar no
/// agendamento uma resposta que so vale no consumo.</para>
/// </summary>
public interface IDelayedScheduler
{
    /// <summary>
    /// Ha transporte configurado para agendar.
    ///
    /// <para>Falso e o estado de quem nunca configurou o broker, e nao um erro. Quem
    /// le isto e a configuracao do ciclo, para <b>recusar</b> uma espera que nao
    /// teria como acontecer — oferecer a janela e nao cumpri-la seria pior do que
    /// nao oferecer.</para>
    /// </summary>
    bool IsAvailable { get; }

    /// <summary>
    /// Marca para olhar este relato daqui a <paramref name="delay"/>.
    ///
    /// <para><b>Chamado depois da gravacao, sempre.</b> O vencimento esta numa
    /// coluna do relato; se a mensagem saisse antes do <c>commit</c>, quem consome
    /// poderia chegar antes de a linha existir e descartar um agendamento
    /// real.</para>
    ///
    /// <para><b>Falhar aqui nao derruba o movimento.</b> O relato ja foi movido e o
    /// vencimento ja esta gravado — sem a mensagem, ele so espera a proxima subida
    /// da aplicacao, que reencontra o que venceu. Perder o agendamento atrasa; nao
    /// corrompe.</para>
    /// </summary>
    Task ScheduleAsync(DelayedCheckKind kind, Guid reportPublicId, TimeSpan delay, CancellationToken cancellationToken = default);
}
