namespace Pds.Domain.Filters;

/// <summary>
/// Os filtros da tela de Trabalho, ja resolvidos para os identificadores do banco:
/// quem esta com o card, as etiquetas, a prioridade, o tipo, o prazo vencido, a busca,
/// o "Em aberto" e as colunas da lista.
///
/// <para><b>Dentro de um filtro, ou; entre filtros, e.</b> A etiqueta A ou a B; da Ana
/// e vencido. Lista vazia e <c>false</c> querem dizer que aquele filtro nao foi
/// pedido.</para>
///
/// <para><b>A subtarefa mora dentro do pai</b>: sem <paramref name="ParentId"/>, so os
/// cards de primeiro nivel. O pai entra no filtro de responsavel e na busca tambem pela
/// subtarefa — e assim que cada um acha a subtarefa que e sua.</para>
/// </summary>
/// <param name="AssigneeIds">
/// As pessoas escolhidas como responsavel. O pai com uma subtarefa de uma delas tambem
/// entra.
/// </param>
/// <param name="WithoutAssignee">Tambem o card sem responsavel.</param>
/// <param name="LabelIds">As etiquetas: basta o card ter uma delas.</param>
/// <param name="PriorityIds">As prioridades escolhidas.</param>
/// <param name="WithoutPriority">Tambem o card sem prioridade.</param>
/// <param name="TypeIds">Os tipos de relato escolhidos, desativados inclusive.</param>
/// <param name="TeamCards">Tambem os cards do time, que nao tem tipo.</param>
/// <param name="OverdueOn">
/// So os vencidos neste dia — o de quem olha: prazo antes dele, e o card ainda nao
/// terminou.
/// </param>
/// <param name="Search">A busca, quando ha uma. O pai tambem entra pelo titulo ou pela descricao de uma subtarefa.</param>
/// <param name="ParentId">So as subtarefas deste card. Sem ele, nenhuma subtarefa: elas so aparecem dentro do pai.</param>
/// <param name="IncludeSubtasks">
/// Sem <paramref name="ParentId"/>, as subtarefas vem junto, como cards proprios, e o pai
/// nao entra mais por elas. So a busca de quem vincula cards usa.
/// </param>
/// <param name="Sprint">O recorte de sprint: a em andamento, o backlog, ou uma sprint.</param>
/// <param name="OpenOnly">
/// So o que nao terminou — o "Em aberto" da tela: sai o relato encerrado e o card na
/// ultima coluna, pela mesma regra do vencido.
/// </param>
/// <param name="StateIds">
/// As colunas escolhidas no filtro da lista. Nula ou vazia, e sem <paramref name="WithoutState"/>,
/// e sem este filtro. Diferente do recorte <c>state</c>, que e uma coluna so e e o do quadro.
/// </param>
/// <param name="WithoutState">Tambem o card que ainda nao tem coluna.</param>
/// <param name="BlockedOrigin">
/// So os relatos marcados com a origem bloqueada: vieram de um endereco que o projeto
/// bloqueou, e o time ainda nao decidiu manter.
/// </param>
public sealed record ReportCardFilter(
    IReadOnlyList<long> AssigneeIds,
    bool WithoutAssignee,
    IReadOnlyList<long> LabelIds,
    IReadOnlyList<long> PriorityIds,
    bool WithoutPriority,
    IReadOnlyList<long> TypeIds,
    bool TeamCards,
    DateOnly? OverdueOn,
    ReportSearch? Search,
    long? ParentId = null,
    SprintScope? Sprint = null,
    bool OpenOnly = false,
    IReadOnlyList<long>? StateIds = null,
    bool WithoutState = false,
    bool BlockedOrigin = false,
    bool IncludeSubtasks = false)
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

/// <summary>Que parte do trabalho em sprints a lista quer.</summary>
public enum SprintScopeKind
{
    /// <summary>A sprint em andamento: o que o quadro mostra.</summary>
    Active,

    /// <summary>O backlog: sem sprint e sem o que ja terminou.</summary>
    Backlog,

    /// <summary>Uma sprint: a lista dela no backlog.</summary>
    Specific,
}

/// <summary>O recorte de sprint da lista. Na <see cref="SprintScopeKind.Specific"/>, a sprint.</summary>
public sealed record SprintScope(SprintScopeKind Kind, long? SprintId = null);

