using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O registro do que aconteceu, e a tabela que responde a pergunta de pesquisa do
/// trabalho.
///
/// <para><b>E a unica tabela do sistema que so cresce.</b> Nunca e alterada e
/// nunca e apagada — nem quando a conta que a originou e excluida. Por isso ela
/// nao herda de <see cref="PdsBaseEntity"/>: nao tem <c>updated_at</c>, porque
/// nada aqui se altera, nem <c>deleted_at</c>, porque nada aqui se apaga. Um
/// evento apagado seria um dado de pesquisa perdido, e a analise passaria a
/// mentir sem ninguem perceber.</para>
///
/// <para>As quatro chaves estrangeiras sao anulaveis pelo mesmo motivo: o evento
/// sobrevive ao que o originou.</para>
/// </summary>
public class Event
{
    /// <summary>Chave interna, sequencial. Nunca sai da aplicacao.</summary>
    public long Id { get; set; }

    /// <summary>Identificador publico, GUID aleatorio.</summary>
    public Guid PublicId { get; set; }

    /// <summary>
    /// Conta de origem. Continua apontando para ela depois de anonimizada — a conta
    /// nao e apagada, e esvaziada —, e so e anulavel para o dia em que a linha da
    /// conta precisar sumir de verdade.
    /// </summary>
    public long? AccountId { get; set; }
    public Account? Account { get; set; }

    /// <summary>
    /// Projeto de origem. Anulavel porque o projeto e apagado de verdade quando a
    /// conta e excluida, e o evento fica.
    /// </summary>
    public long? ProjectId { get; set; }
    public Project? Project { get; set; }

    /// <summary>Relato a que o evento se refere. Nulo quando o evento nao nasce de um relato.</summary>
    public long? ReportId { get; set; }
    public Report? Report { get; set; }

    /// <summary>
    /// Quem fez. Nulo quando ninguem do time fez — o relato que entra pelo site de
    /// um cliente nasce de um desconhecido, que nao tem usuario aqui.
    ///
    /// <para>Tambem e nulo nos eventos gravados <b>antes</b> desta coluna existir:
    /// inventar um autor para eles seria pior do que admitir que nao se sabe.</para>
    /// </summary>
    public long? UserId { get; set; }
    public User? User { get; set; }

    /// <summary>O que aconteceu.</summary>
    public EventTypeEnum Type { get; set; }

    /// <summary>De onde a acao partiu.</summary>
    public EventSourceEnum Source { get; set; }

    /// <summary>
    /// O resto do evento, em chave e valor. Campo livre de proposito: e o que
    /// permite um tipo novo entrar sem migracao numa tabela que so cresce.
    /// </summary>
    public string? Payload { get; set; }

    /// <summary>
    /// Quando aconteceu, em UTC. <b>E esta a data que a analise usa</b>, e nao
    /// <see cref="CreatedAt"/> — as duas divergem quando houve retentativa, e usar
    /// a errada desloca o evento para o momento em que o sistema se recuperou.
    /// </summary>
    public DateTime OccurredAt { get; set; }

    /// <summary>Quando a linha foi gravada, em UTC.</summary>
    public DateTime CreatedAt { get; set; }
}
