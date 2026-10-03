namespace Pds.Domain.Filters;

/// <summary>Em que ordem a lista de cards vem.</summary>
public enum ReportListOrder
{
    /// <summary>Do mais recente para o mais antigo — a lista de sempre.</summary>
    Recent,

    /// <summary>
    /// A ordem do quadro: a que o time arrumou em cada coluna, de cima para baixo.
    /// So faz sentido dentro de uma coluna.
    /// </summary>
    Board,
}
