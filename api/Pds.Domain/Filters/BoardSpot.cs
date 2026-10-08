namespace Pds.Domain.Filters;

/// <summary>
/// Onde um card esta no quadro: a coluna e o lugar nela. E o que se le do card de
/// referencia ao soltar outro logo abaixo dele.
/// </summary>
/// <param name="Id">O card.</param>
/// <param name="StateId">A coluna; nula quando o card ainda nao tem lugar na fila.</param>
/// <param name="Rank">O lugar na coluna; o menor fica em cima.</param>
/// <param name="Archived">Se o card esta arquivado — fora do quadro.</param>
public record BoardSpot(long Id, long? StateId, long Rank, bool Archived);

/// <summary>Um card na ordem do backlog: a lista em que esta (a sprint, ou nenhuma) e o lugar.</summary>
public record BacklogSpot(long Id, long? SprintId, long Rank, bool Archived, long? ParentId);

/// <summary>Os numeros de uma sprint: os cards (sem as subtarefas e o arquivo), os que terminaram, e os pontos.</summary>
public record SprintStats(int Cards, int DoneCards, decimal Points, decimal DonePoints)
{
    public static readonly SprintStats Empty = new(0, 0, 0, 0);
}

