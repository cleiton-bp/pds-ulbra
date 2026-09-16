namespace Pds.Domain.Filters;

/// <summary>
/// Quantos relatos ha em cada coluna da fila.
/// </summary>
/// <param name="StateId">Chave interna do estado; nulo na linha dos que nao tem lugar na fila.</param>
/// <param name="StatePublicId">Identificador publico do estado; nulo na mesma linha.</param>
/// <param name="StateName">Nome do estado; nulo na mesma linha.</param>
/// <param name="IsActive">Falso quando o estado foi aposentado. Sempre verdadeiro na linha sem estado.</param>
/// <param name="Total">Quantos relatos estao ali.</param>
public record ReportStateCount(
    long? StateId,
    Guid? StatePublicId,
    string? StateName,
    bool IsActive,
    int Total);
