namespace Pds.Domain.Entities;

/// <summary>
/// Uma etiqueta num card. Um par por vez: a mesma etiqueta nao entra duas vezes no
/// mesmo card.
/// </summary>
public class ReportLabel : PdsBaseEntity
{
    /// <summary>O card etiquetado.</summary>
    public long ReportId { get; set; }
    public Report Report { get; set; } = null!;

    /// <summary>A etiqueta, do mesmo projeto do card.</summary>
    public long ProjectLabelId { get; set; }
    public ProjectLabel ProjectLabel { get; set; } = null!;
}
