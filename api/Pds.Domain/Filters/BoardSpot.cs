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
