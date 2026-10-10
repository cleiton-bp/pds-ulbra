namespace Pds.Domain.ViewModels;

/// <summary>
/// O que um lote sobre os cards de origem bloqueada fez.
/// </summary>
/// <param name="Affected">
/// Quantos cards marcados o lote alcancou. No apagar, sem contar as subtarefas que
/// foram junto (<paramref name="SubtasksDeleted"/>).
/// </param>
/// <param name="Skipped">Quantos dos escolhidos ficaram de fora por nao estarem marcados.</param>
/// <param name="SubtasksDeleted">No apagar, as subtarefas que foram com o pai. Zero no manter.</param>
public record BlockedOriginReportsResultViewModel(int Affected, int Skipped, int SubtasksDeleted);
