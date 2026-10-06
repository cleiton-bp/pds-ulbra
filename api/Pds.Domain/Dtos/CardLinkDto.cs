using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>Vincular o card aberto a outro do mesmo projeto.</summary>
public class CreateCardLinkDto
{
    /// <summary>
    /// O vinculo visto do card aberto: <c>DuplicateOf</c> (este e duplicado do outro),
    /// <c>DuplicatedBy</c>, <c>Blocks</c>, <c>BlockedBy</c> ou <c>RelatesTo</c>. Obrigatorio.
    /// </summary>
    /// <example>DuplicateOf</example>
    public CardLinkRelationEnum? Type { get; set; }

    /// <summary>O outro card. Obrigatorio.</summary>
    public Guid? TargetPublicId { get; set; }
}
