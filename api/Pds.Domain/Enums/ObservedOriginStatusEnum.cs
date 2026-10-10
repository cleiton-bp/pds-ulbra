namespace Pds.Domain.Enums;

/// <summary>
/// Como o projeto trata hoje um endereco que ja mandou relatos.
/// </summary>
public enum ObservedOriginStatusEnum
{
    /// <summary>
    /// Nem autorizado nem bloqueado. Com a lista de autorizados vazia, ele passa; com
    /// ela preenchida, ele e recusado — a tela diz qual dos dois, lendo a lista.
    /// </summary>
    Unlisted,

    /// <summary>Uma linha da lista de autorizados vale para ele.</summary>
    Allowed,

    /// <summary>Uma linha da lista de bloqueados vale para ele: e recusado, mesmo autorizado.</summary>
    Blocked,
}
