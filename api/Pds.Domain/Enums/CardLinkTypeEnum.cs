namespace Pds.Domain.Enums;

/// <summary>
/// O tipo de um vinculo entre dois cards, gravado na direcao em que vale.
/// </summary>
public enum CardLinkTypeEnum
{
    /// <summary>
    /// O card de origem e duplicado do de destino — o original. O duplicado sai do
    /// quadro e, quando e relato, acompanha a jornada e o desfecho do original.
    /// </summary>
    DuplicateOf,

    /// <summary>O card de origem bloqueia o de destino. So marca: mover continua livre.</summary>
    Blocks,

    /// <summary>Os dois tratam de coisas proximas. Sem direcao que importe.</summary>
    RelatesTo,
}
