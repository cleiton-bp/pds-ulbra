using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Um aviso para uma pessoa do time: alguem a mencionou num comentario interno, ou a
/// escolheu como responsavel por um card. E o que o sino do painel mostra.
///
/// <para><b>Interno, e de uma pessoa so.</b> Nenhuma rota publica le esta tabela, e
/// cada pessoa le so os proprios avisos — e so dos projetos em que ainda esta.</para>
/// </summary>
public class Notification : PdsBaseEntity
{
    /// <summary>Quem recebe o aviso.</summary>
    public long UserId { get; set; }
    public User User { get; set; } = null!;

    /// <summary>O projeto do card, repetido para o filtro de acesso nao precisar de juncao.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>O card de que o aviso fala.</summary>
    public long ReportId { get; set; }
    public Report Report { get; set; } = null!;

    /// <summary>Quem fez: quem mencionou, ou quem escolheu o responsavel.</summary>
    public long? ActorUserId { get; set; }
    public User? ActorUser { get; set; }

    public NotificationKindEnum Kind { get; set; }

    /// <summary>O comentario interno da mencao. Nulo na atribuicao.</summary>
    public long? ReportInternalCommentId { get; set; }
    public ReportInternalComment? ReportInternalComment { get; set; }

    /// <summary>Quando a pessoa abriu ou marcou como lido. Nulo enquanto nao leu.</summary>
    public DateTime? ReadAt { get; set; }
}
