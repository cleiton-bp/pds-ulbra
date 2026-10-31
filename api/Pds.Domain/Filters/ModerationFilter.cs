using Pds.Domain.Enums;

namespace Pds.Domain.Filters;

/// <summary>
/// O recorte da fila de moderacao, ja resolvido para o banco: o estado, onde a pagina
/// anterior parou, quantos trazer e os filtros da tela.
///
/// <para><b>Duas ordens, uma por natureza da aba.</b> <c>Pending</c> e fila: do mais
/// antigo para o mais novo por <c>created_at</c>, para o primeiro que chegou nao esperar
/// para sempre. <c>Approved</c> e <c>Rejected</c> sao historico: do mais recente para o
/// mais antigo por <c>moderated_at</c>, para a decisao de agora estar no topo — e e dela
/// que alguem se arrepende.</para>
/// </summary>
/// <param name="State">A aba.</param>
/// <param name="After">Onde a pagina anterior parou; nulo na primeira.</param>
/// <param name="Limit">Quantos trazer. Quem chama pede um a mais para saber se ha mais.</param>
/// <param name="Search">A busca, pelas mesmas regras da tela de Trabalho.</param>
/// <param name="TypeIds">Os tipos escolhidos, desativados inclusive. Vazia: todos.</param>
/// <param name="From">Chegou a partir deste instante (inclusivo).</param>
/// <param name="To">Chegou antes deste instante (exclusivo).</param>
/// <param name="Origin">O dominio de onde veio, ja normalizado; nulo sem o filtro.</param>
/// <param name="WithoutOrigin">So os que chegaram sem dominio informado.</param>
public sealed record ModerationFilter(
    ReportModerationStateEnum State,
    ModerationCursor? After,
    int Limit,
    ReportSearch? Search,
    IReadOnlyList<long> TypeIds,
    DateTime? From,
    DateTime? To,
    string? Origin,
    bool WithoutOrigin)
{
    /// <summary>Algum filtro alem da aba: a contagem das abas passa a seguir os filtros.</summary>
    public bool Filtered => Search is not null || TypeIds.Count > 0 || From is not null || To is not null
                            || Origin is not null || WithoutOrigin;
}

/// <summary>
/// Onde uma pagina da fila de moderacao parou: o valor da ordem e o desempate da
/// ultima linha entregue.
///
/// <para><b>Valor, e nao "depois do relato X".</b> Na fila, o relato X costuma ser
/// decidido logo depois de lido — e um cursor que apontasse para ele deixaria de
/// achar o lugar justamente quando a pessoa pede mais.</para>
/// </summary>
/// <param name="State">A aba de onde veio: o cursor de uma aba nao vale na outra.</param>
/// <param name="At">O <c>created_at</c> (fila) ou o <c>moderated_at</c> (historico) da ultima linha.</param>
/// <param name="Id">O desempate da ultima linha: o Id, achado pelo identificador publico que viaja no cursor. O Id nunca sai da API.</param>
public sealed record ModerationCursor(ReportModerationStateEnum State, DateTime At, long Id);

/// <summary>Quantos relatos ha em cada aba da moderacao.</summary>
public sealed record ModerationCounts(int Pending, int Approved, int Rejected);
