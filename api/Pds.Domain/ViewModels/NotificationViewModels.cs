using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>Um aviso do sino.</summary>
/// <param name="PublicId">O identificador do aviso — o que se manda para marcar como lido.</param>
/// <param name="Kind">Mencao num comentario interno, ou escolha como responsavel.</param>
/// <param name="CreatedAt">Quando aconteceu, em UTC.</param>
/// <param name="ReadAt">Quando a pessoa leu; nulo enquanto nao leu.</param>
/// <param name="ActorName">Quem fez. Nulo quando a pessoa nao tem nome nem e-mail.</param>
/// <param name="Project">O projeto do card.</param>
/// <param name="Card">O card: o numero e o titulo como a tela mostra.</param>
public record NotificationViewModel(
    Guid PublicId,
    NotificationKindEnum Kind,
    DateTime CreatedAt,
    DateTime? ReadAt,
    string? ActorName,
    NotificationProjectViewModel Project,
    CardParentViewModel Card);

/// <summary>O projeto de um aviso.</summary>
public record NotificationProjectViewModel(Guid PublicId, string Name);

/// <summary>Os avisos mais recentes, e quantos a pessoa ainda nao leu — inclusive os que nao vieram na lista.</summary>
public record NotificationListViewModel(IReadOnlyList<NotificationViewModel> Items, int UnreadCount);

/// <summary>Quantos avisos a pessoa ainda nao leu: o numero do sino.</summary>
public record NotificationCountViewModel(int UnreadCount);

/// <summary>As preferencias de aviso da pessoa.</summary>
/// <param name="AssignmentByEmail">Se recebe e-mail quando a escolhem como responsavel.</param>
/// <param name="EmailAvailable">
/// Se esta instalacao manda e-mail — servidor de e-mail, fila e o endereco do painel
/// configurados. Sem isso a preferencia fica guardada, e nada sai.
/// </param>
public record NotificationSettingsViewModel(bool AssignmentByEmail, bool EmailAvailable);
