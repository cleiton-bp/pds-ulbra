using System.Text.Json;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Service.Cards;

/// <summary>
/// Levar um card para uma sprint, ou para o backlog — pela mao de alguem, pelo
/// fechamento da sprint ou pela sprint apagada. **A subtarefa vai junto com o pai**,
/// cada uma com o seu evento.
/// </summary>
public static class SprintMoves
{
    /// <summary>
    /// Troca a sprint do card e das subtarefas, gravando o evento de cada um. Nao grava:
    /// quem chama confirma junto do resto. Devolve as subtarefas que foram junto.
    /// </summary>
    /// <param name="because">Por que, quando nao foi a mao: <c>sprint_closed</c>, <c>sprint_deleted</c>.</param>
    public static async Task<List<Report>> MoveAsync(
        IUnitOfWork unitOfWork,
        Project project,
        Report card,
        Sprint? destino,
        long? userId,
        string? because,
        CancellationToken cancellationToken)
    {
        if (card.SprintId == destino?.Id)
            return [];

        var origem = card.SprintId is long origemId
            ? card.Sprint ?? await unitOfWork.Sprints.GetByIdAsync(origemId, cancellationToken)
            : null;

        await AddEventAsync(unitOfWork, project, card, origem, destino, userId, because, cancellationToken);
        card.SprintId = destino?.Id;
        card.Sprint = destino;

        var subtarefas = await unitOfWork.Reports.ListSubtasksAsync(card.Id, cancellationToken);
        foreach (var subtarefa in subtarefas.Where(subtarefa => subtarefa.SprintId != destino?.Id))
        {
            await AddEventAsync(unitOfWork, project, subtarefa, origem, destino, userId, because ?? "with_parent", cancellationToken);
            subtarefa.SprintId = destino?.Id;
            subtarefa.Sprint = destino;
        }

        return subtarefas;
    }

    private static Task AddEventAsync(
        IUnitOfWork unitOfWork,
        Project project,
        Report card,
        Sprint? origem,
        Sprint? destino,
        long? userId,
        string? because,
        CancellationToken cancellationToken)
        => unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReportId = card.Id,
            UserId = userId,
            Type = EventTypeEnum.CardSprintChanged,
            Source = EventSourceEnum.Panel,
            // Os nomes da epoca, como o estado: renomear a sprint nao reescreve o passado.
            // Nulo e o backlog.
            Payload = JsonSerializer.Serialize(new
            {
                from_id = origem?.PublicId,
                from_name = origem?.Name,
                to_id = destino?.PublicId,
                to_name = destino?.Name,
                because,
            }),
        }, cancellationToken);
}
