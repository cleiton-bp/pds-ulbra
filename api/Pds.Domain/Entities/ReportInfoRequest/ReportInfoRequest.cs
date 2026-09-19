namespace Pds.Domain.Entities;

/// <summary>
/// O time devolveu o relato pedindo contexto, em vez de encerrar.
///
/// <para><b>"Volta para o relator" sao dois casos, e nao um.</b> Precisar de
/// informacao e recusar de fato sao coisas opostas, e chegando iguais do outro
/// lado a pessoa entende que acabou e para de responder — o relato morre por
/// ruido, que e exatamente o problema que este produto existe para resolver. Por
/// isso "nao reproduzi" nao encerra nada: vira um pedido, que diz <b>o que
/// falta</b>.</para>
///
/// <para><b>Tabela propria, pelo mesmo motivo de <see cref="ReportClosure"/>:</b>
/// acontece mais de uma vez por relato, espera resposta de quem esta do outro
/// lado, e tem prazo proprio.</para>
///
/// <para><b>A pergunta nao mora aqui.</b> Ela e um comentario publico, porque a
/// conversa acontece pelo proprio relato — e guardar o texto tambem nesta tabela
/// criaria duas copias dele para divergirem. Esta linha guarda o <b>relogio</b>.</para>
/// </summary>
public class ReportInfoRequest : PdsBaseEntity
{
    /// <summary>Relato devolvido.</summary>
    public long ReportId { get; set; }
    public Report Report { get; set; } = null!;

    /// <summary>
    /// Quem do time pediu.
    ///
    /// <para><b>Obrigatorio, ao contrario de
    /// <see cref="ReportClosure.ClosedByUserId"/>.</b> O sistema encerra sozinho no
    /// fim do prazo, mas nunca pergunta nada por conta propria — pedir informacao e
    /// sempre ato de uma pessoa.</para>
    /// </summary>
    public long AskedByUserId { get; set; }
    public User AskedByUser { get; set; } = null!;

    /// <summary>Quando o pedido foi aberto, em UTC.</summary>
    public DateTime AskedAt { get; set; }

    /// <summary>
    /// A partir de quando a pagina publica avisa que o relato vai encerrar por
    /// falta de resposta.
    ///
    /// <para><b>Gravado aqui, e nao lido da configuracao na hora de mostrar.</b>
    /// Mudar o prazo do projeto nao pode mover o prazo de um pedido que ja esta
    /// correndo — quem foi avisado de uma data precisa continuar tendo aquela
    /// data.</para>
    ///
    /// <para><b>E um estado de tela, e nao um envio.</b> Enquanto nao houver canal
    /// de comunicacao, "avisar" e a pagina de acompanhamento dizendo quantos dias
    /// faltam. Nao ha nada agendado para este momento; o unico agendamento e o do
    /// encerramento.</para>
    /// </summary>
    public DateTime WarnAt { get; set; }

    /// <summary>
    /// Quando o relato encerra como "sem retorno", se ninguem responder. <b>E este
    /// o momento agendado na fila.</b>
    /// </summary>
    public DateTime CloseAt { get; set; }

    /// <summary>
    /// Quando quem relatou respondeu. Preenchido, o pedido deixou de esperar e o
    /// prazo nao vale mais — a mensagem agendada chega, ve isto, e se descarta.
    /// </summary>
    public DateTime? AnsweredAt { get; set; }

    /// <summary>
    /// Quando o prazo venceu e o relato foi encerrado sem resposta.
    ///
    /// <para>Com <see cref="AnsweredAt"/> nulo, e o registro de que o silencio
    /// acabou o assunto. O encerramento em si mora em <see cref="ReportClosure"/>,
    /// com autor nulo — foi o sistema.</para>
    /// </summary>
    public DateTime? ExpiredAt { get; set; }

    /// <summary>
    /// O pedido ainda espera resposta.
    ///
    /// <para>Nao e coluna: e a leitura das duas datas acima, e ter uma terceira
    /// coluna dizendo o mesmo criaria um jeito de as tres discordarem.</para>
    /// </summary>
    public bool IsOpen => AnsweredAt is null && ExpiredAt is null;
}
