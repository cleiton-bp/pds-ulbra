using Pds.Domain.Enums;

namespace Pds.Domain.Filters;

/// <summary>
/// Os filtros da tela de Trabalho, ja resolvidos para os identificadores do banco:
/// quem esta com o card, as etiquetas, a prioridade, o tipo, o prazo vencido e a busca.
///
/// <para><b>Dentro de um filtro, ou; entre filtros, e.</b> A etiqueta A ou a B; da Ana
/// e vencido. Lista vazia e <c>false</c> querem dizer que aquele filtro nao foi
/// pedido.</para>
/// </summary>
/// <param name="AssigneeIds">As pessoas escolhidas como responsavel.</param>
/// <param name="WithoutAssignee">Tambem o card sem responsavel.</param>
/// <param name="LabelIds">As etiquetas: basta o card ter uma delas.</param>
/// <param name="PriorityIds">As prioridades escolhidas.</param>
/// <param name="WithoutPriority">Tambem o card sem prioridade.</param>
/// <param name="Types">Os tipos de relato escolhidos.</param>
/// <param name="TeamCards">Tambem os cards do time, que nao tem tipo.</param>
/// <param name="OverdueOn">
/// So os vencidos neste dia — o de quem olha: prazo antes dele, e o card ainda nao
/// terminou.
/// </param>
/// <param name="Search">A busca, quando ha uma.</param>
/// <param name="ParentId">So as subtarefas deste card.</param>
public sealed record ReportCardFilter(
    IReadOnlyList<long> AssigneeIds,
    bool WithoutAssignee,
    IReadOnlyList<long> LabelIds,
    IReadOnlyList<long> PriorityIds,
    bool WithoutPriority,
    IReadOnlyList<ReportTypeEnum> Types,
    bool TeamCards,
    DateOnly? OverdueOn,
    ReportSearch? Search,
    long? ParentId = null)
{
    /// <summary>Nenhum filtro: a tela inteira.</summary>
    public static readonly ReportCardFilter None = new([], false, [], [], false, [], false, null, null);
}

/// <summary>
/// A busca da tela de Trabalho.
/// </summary>
/// <param name="Text">O termo sem acento e em minusculas (ver <see cref="SearchText"/>).</param>
/// <param name="Number">O numero do card, quando o termo e um (<c>42</c> ou <c>#42</c>).</param>
/// <param name="Code">O termo como protocolo: so letras e digitos, em maiusculas. Nulo quando nao sobra nada.</param>
public sealed record ReportSearch(string Text, int? Number, string? Code);
