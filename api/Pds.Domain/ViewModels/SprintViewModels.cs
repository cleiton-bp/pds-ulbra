using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>Uma sprint, com os numeros dela.</summary>
/// <param name="PublicId">O identificador da sprint.</param>
/// <param name="Number">O numero da sprint no projeto.</param>
/// <param name="Name">O nome.</param>
/// <param name="Goal">O objetivo; nulo sem objetivo.</param>
/// <param name="State">Planejada, em andamento ou fechada.</param>
/// <param name="StartsOn">O primeiro dia.</param>
/// <param name="EndsOn">O ultimo dia.</param>
/// <param name="StartedAt">Quando foi iniciada; nulo na planejada.</param>
/// <param name="ClosedAt">Quando foi fechada; nulo na que nao fechou.</param>
/// <param name="Cards">Os cards dela, sem as subtarefas e sem o arquivo.</param>
/// <param name="DoneCards">Deles, os que terminaram — a regra do prazo e do bloqueio.</param>
/// <param name="Points">A soma dos pontos.</param>
/// <param name="DonePoints">A soma dos pontos dos que terminaram.</param>
public record SprintViewModel(
    Guid PublicId,
    int Number,
    string Name,
    string? Goal,
    SprintStateEnum State,
    DateOnly StartsOn,
    DateOnly EndsOn,
    DateTime? StartedAt,
    DateTime? ClosedAt,
    int Cards,
    int DoneCards,
    decimal Points,
    decimal DonePoints);

/// <summary>O que aconteceu ao fechar a sprint.</summary>
/// <param name="Sprint">A sprint fechada, com os numeros de quando fechou.</param>
/// <param name="Moved">Quantos cards que nao terminaram foram para o destino.</param>
/// <param name="Destination">A sprint de destino; nula quando foram para o backlog.</param>
public record CloseSprintResultViewModel(SprintViewModel Sprint, int Moved, SprintViewModel? Destination);
