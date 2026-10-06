namespace Pds.Domain.Enums;

/// <summary>
/// Um vinculo visto de um dos dois cards. O banco guarda a direcao em que vale
/// (<see cref="CardLinkTypeEnum"/>); a tela le e escreve pelo card que esta aberto.
/// </summary>
public enum CardLinkRelationEnum
{
    /// <summary>Este card e duplicado do outro, o original.</summary>
    DuplicateOf,

    /// <summary>O outro card e duplicado deste.</summary>
    DuplicatedBy,

    /// <summary>Este card bloqueia o outro.</summary>
    Blocks,

    /// <summary>Este card e bloqueado pelo outro.</summary>
    BlockedBy,

    /// <summary>Os dois tratam de coisas proximas.</summary>
    RelatesTo,
}
