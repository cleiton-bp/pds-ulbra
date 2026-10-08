namespace Pds.Domain.Filters;

/// <summary>Por qual dado a lista do Trabalho se ordena, quando a pessoa escolhe.</summary>
public enum ReportSortField
{
    /// <summary>O numero do card (#42).</summary>
    Number,

    /// <summary>A coluna, na ordem do quadro. O card sem coluna fica no fim.</summary>
    State,

    /// <summary>O nome de quem esta com o card. O sem responsavel fica no fim.</summary>
    Assignee,

    /// <summary>A prioridade, na ordem do projeto. O sem prioridade fica no fim.</summary>
    Priority,

    /// <summary>O prazo. O sem prazo fica no fim.</summary>
    Due,

    /// <summary>Quando o card chegou ou foi criado.</summary>
    Created,

    /// <summary>A ultima mudanca gravada no proprio card.</summary>
    Updated,
}

/// <summary>
/// A ordem que a pessoa escolheu na lista do Trabalho: o dado e a direcao.
///
/// <para><b>O vazio fica sempre no fim</b>, nas duas direcoes — o card sem prazo nao
/// e o que vence primeiro nem o que vence por ultimo, e no topo ele esconderia os que
/// tem. O empate fica com o mais novo primeiro, e o Id desempata no fim: a mesma
/// pagina nunca depende da sorte.</para>
/// </summary>
/// <param name="Field">O dado.</param>
/// <param name="Descending">Do maior para o menor: o mais novo, a prioridade mais alta, o prazo mais longe.</param>
public sealed record ReportListSort(ReportSortField Field, bool Descending);
