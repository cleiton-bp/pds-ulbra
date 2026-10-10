using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Um aviso para uma pessoa do time: alguem a mencionou num comentario interno, ou a
/// escolheu como responsavel por um card. E o que o sino do painel mostra.
///
/// <para>Dois avisos sao do projeto, e nao de um card, e vao para quem administra: um
/// endereco novo mandou relato (<see cref="NotificationKindEnum.OriginPending"/>) e os
/// envios foram pausados por excesso (<see cref="NotificationKindEnum.ReportsPaused"/>).
/// Nesses o card fica nulo — o relato retido nao aparece para o time —, e o que o aviso
/// diz vem em <see cref="Subject"/>, <see cref="LimitScope"/> e <see cref="PausedUntil"/>.</para>
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

    /// <summary>O card de que o aviso fala. Nulo nos avisos do projeto.</summary>
    public long? ReportId { get; set; }
    public Report? Report { get; set; }

    /// <summary>Quem fez: quem mencionou, ou quem escolheu o responsavel.</summary>
    public long? ActorUserId { get; set; }
    public User? ActorUser { get; set; }

    public NotificationKindEnum Kind { get; set; }

    /// <summary>O comentario interno da mencao. Nulo na atribuicao.</summary>
    public long? ReportInternalCommentId { get; set; }
    public ReportInternalComment? ReportInternalComment { get; set; }

    /// <summary>Quando a pessoa abriu ou marcou como lido. Nulo enquanto nao leu.</summary>
    public DateTime? ReadAt { get; set; }

    /// <summary>
    /// O endereco de que o aviso do projeto fala: o que mandou relato sem estar
    /// autorizado, ou o pausado por excesso. Nulo nos outros — <b>nunca um IP</b>: a
    /// pausa por IP ou por pessoa diz so a camada.
    /// </summary>
    public string? Subject { get; set; }

    /// <summary>A camada que pausou os envios. So no aviso de pausa.</summary>
    public ReportLimitScopeEnum? LimitScope { get; set; }

    /// <summary>Ate quando os envios ficam pausados, em UTC. So no aviso de pausa.</summary>
    public DateTime? PausedUntil { get; set; }

    /// <summary>Teto do endereco guardado no aviso, o mesmo de <c>reports.origin</c>.</summary>
    public const int MaxSubjectLength = 260;
}
