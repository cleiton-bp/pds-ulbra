namespace Pds.Domain.Dtos;

/// <summary>
/// Quais cards marcados com a origem bloqueada o lote alcanca: os escolhidos na lista,
/// ou todos os de um endereco bloqueado. Um dos dois, e so um.
/// </summary>
public class BlockedOriginReportsDto
{
    /// <summary>
    /// Os cards escolhidos, pelo identificador publico. Os que nao estao marcados — nao
    /// vieram de um endereco bloqueado, ou o time ja os manteve — ficam de fora.
    /// </summary>
    public List<Guid>? ReportIds { get; set; }

    /// <summary>Todos os cards marcados que vieram do endereco deste bloqueio.</summary>
    public Guid? BlockedOriginId { get; set; }
}

/// <summary>
/// O apagar de vez, que pede a confirmacao escrita alem de quais cards.
/// </summary>
public class DeleteBlockedOriginReportsDto : BlockedOriginReportsDto
{
    /// <summary>
    /// A palavra <c>apagar</c>, ou o endereco de onde todos os cards vieram — o que a
    /// pessoa digitou na tela. Sem ela, nada e apagado: nao ha volta.
    /// </summary>
    /// <example>apagar</example>
    public string? Confirmation { get; set; }
}
