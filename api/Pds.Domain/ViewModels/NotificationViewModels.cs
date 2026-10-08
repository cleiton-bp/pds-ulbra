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
/// <param name="Comment">O comentario da mencao, com o comeco do texto. Nulo na atribuicao, e na mencao cujo comentario saiu.</param>
public record NotificationViewModel(
    Guid PublicId,
    NotificationKindEnum Kind,
    DateTime CreatedAt,
    DateTime? ReadAt,
    string? ActorName,
    NotificationProjectViewModel Project,
    CardParentViewModel Card,
    NotificationCommentViewModel? Comment);

/// <summary>O projeto de um aviso.</summary>
public record NotificationProjectViewModel(Guid PublicId, string Name);

/// <summary>O comentario de uma mencao.</summary>
/// <param name="PublicId">O identificador do comentario — o painel rola ate ele ao abrir o card.</param>
/// <param name="Excerpt">O comeco do texto, como a pessoa le: as mencoes como "@Nome", numa linha so, ate uns 90 caracteres.</param>
public record NotificationCommentViewModel(Guid PublicId, string Excerpt);

/// <summary>Uma pagina dos avisos, do mais novo para o mais antigo, e quantos a pessoa ainda nao leu — inclusive os que nao vieram.</summary>
/// <param name="Items">Os avisos da pagina.</param>
/// <param name="UnreadCount">Quantos a pessoa nao leu, em todos os projetos em que esta.</param>
/// <param name="HasMore">Se ha avisos mais antigos depois do ultimo desta pagina.</param>
public record NotificationListViewModel(IReadOnlyList<NotificationViewModel> Items, int UnreadCount, bool HasMore);

/// <summary>Quantos avisos a pessoa ainda nao leu: o numero do sino.</summary>
public record NotificationCountViewModel(int UnreadCount);

/// <summary>As preferencias de aviso da pessoa: o volume e o som de cada tipo de aviso.</summary>
/// <param name="Volume">O volume do som, de 0 a 100.</param>
/// <param name="Sounds">O som de cada tipo de aviso — todos os tipos, o de fabrica quando a pessoa nao escolheu.</param>
public record NotificationSettingsViewModel(int Volume, IReadOnlyList<NotificationSoundViewModel> Sounds);

/// <summary>O som de um tipo de aviso.</summary>
/// <param name="Kind">O tipo de aviso.</param>
/// <param name="Sound">O som; `None` e so o sino, sem som.</param>
public record NotificationSoundViewModel(NotificationKindEnum Kind, NotificationSoundEnum Sound);
