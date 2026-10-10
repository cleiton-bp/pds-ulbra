using System.Text.RegularExpressions;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Filters;
using Pds.Service.Reports;

namespace Pds.Service.Services;

/// <summary>
/// Os filtros da tela de Trabalho: o que chega na URL vira o filtro resolvido, com os
/// identificadores do banco.
/// </summary>
public partial class ReportService
{
    /// <summary>O tamanho maximo da busca. Mais que isso nao e procura, e colagem.</summary>
    public const int MaxSearchLength = 200;

    private static readonly Regex NumeroDoCard = new(@"^#?(\d{1,9})$", RegexOptions.Compiled);

    /// <summary>
    /// O filtro da tela de Trabalho, resolvido.
    ///
    /// <para><b>O identificador que nao e do projeto e recusado</b> (404), e nao vira
    /// lista vazia: lista vazia responderia "nada com esta etiqueta" a uma pergunta
    /// sobre uma etiqueta que nao existe, e o erro passaria despercebido — o mesmo
    /// desenho do filtro de coluna. A pessoa tem de estar no time agora: e quem a tela
    /// oferece.</para>
    /// </summary>
    private async Task<ReportCardFilter> ResolveCardFilterAsync(Project project, ReportFilterDto? dto, CancellationToken cancellationToken)
    {
        if (dto is null)
            return ReportCardFilter.None;

        var (pessoas, semResponsavel) = await ResolveAssigneesAsync(project, dto.Assignee, cancellationToken);
        var etiquetas = await ResolveLabelsAsync(project.Id, dto.Label, cancellationToken);
        var (prioridades, semPrioridade) = await ResolvePrioritiesAsync(project.Id, dto.Priority, cancellationToken);
        var (tipos, doTime) = await ResolveTypesAsync(project.Id, dto.Type, cancellationToken);

        // As subtarefas de um card: o card tem de ser do projeto, como todo filtro.
        long? pai = dto.Parent is Guid paiPublicId
            ? (await _unitOfWork.Reports.FindParentAsync(project.Id, paiPublicId, cancellationToken))?.Id
              ?? throw new KeyNotFoundException("Card nao encontrado neste projeto.")
            : null;

        var (colunas, semColuna) = await ResolveColumnsAsync(project.Id, dto.Column, cancellationToken);

        return new ReportCardFilter(
            pessoas, semResponsavel, etiquetas, prioridades, semPrioridade, tipos, doTime,
            ResolveOverdue(dto.Due, dto.Today), ResolveSearch(dto.Q), pai,
            await ResolveSprintScopeAsync(project.Id, dto.Sprint, cancellationToken),
            OpenOnly: dto.Open == true,
            StateIds: colunas,
            WithoutState: semColuna,
            BlockedOrigin: ResolveOrigin(dto.Origin),
            IncludeSubtasks: dto.IncludeSubtasks == true);
    }

    /// <summary>O filtro de origem: so <c>blocked</c>, os relatos marcados com a origem bloqueada.</summary>
    private static bool ResolveOrigin(string? origin)
        => origin?.Trim().ToLowerInvariant() switch
        {
            null or "" => false,
            "blocked" => true,
            _ => throw new ArgumentException("Filtro de origem desconhecido. Use blocked."),
        };

    /// <summary>
    /// As colunas do filtro da lista. A coluna que sumiu vira o identificador que nenhum
    /// card tem, como a etiqueta apagada: o filtro guardado na aba continua lendo.
    /// </summary>
    private async Task<(IReadOnlyList<long> Colunas, bool SemColuna)> ResolveColumnsAsync(long projectId, List<string>? valores, CancellationToken cancellationToken)
    {
        var pedidas = Distintos(valores);
        if (pedidas.Count == 0)
            return ([], false);

        var semColuna = pedidas.Any(valor => valor.Equals(WithoutStateFilter, StringComparison.OrdinalIgnoreCase));
        var ids = new List<Guid>();

        foreach (var valor in pedidas.Where(valor => !valor.Equals(WithoutStateFilter, StringComparison.OrdinalIgnoreCase)))
        {
            if (!Guid.TryParse(valor, out var publicId))
                throw new ArgumentException($"Coluna invalida: use {WithoutStateFilter} ou o identificador da coluna.");
            ids.Add(publicId);
        }

        if (ids.Count == 0)
            return ([], semColuna);

        // A aposentada entra: ela continua segurando os cards que ficaram nela.
        var doProjeto = await _unitOfWork.ProjectStates.ListByProjectAsync(projectId, cancellationToken);
        var achadas = doProjeto.Where(estado => ids.Contains(estado.PublicId)).Select(estado => estado.Id).ToList();
        if (achadas.Count != ids.Distinct().Count())
            achadas.Add(FiltroQueSumiu);

        return (achadas, semColuna);
    }

    /// <summary>
    /// A ordem que a pessoa escolheu na lista. <b>So na lista de sempre</b>: o quadro e
    /// o backlog tem a ordem que o time arrumou, e misturar as duas faria o "Mostrar
    /// mais" do quadro pular cards. Sem <c>sort</c>, nulo — a lista do mais novo para o
    /// mais antigo, como sempre foi.
    /// </summary>
    private static ReportListSort? ResolveSort(string? sort, string? dir, ReportListOrder ordem)
    {
        var campo = sort?.Trim().ToLowerInvariant();
        var direcao = dir?.Trim().ToLowerInvariant();

        if (string.IsNullOrEmpty(campo))
        {
            if (!string.IsNullOrEmpty(direcao))
                throw new ArgumentException("A direcao (dir) vai junto da ordenacao (sort).");
            return null;
        }

        if (ordem != ReportListOrder.Recent)
            throw new ArgumentException("A ordenacao (sort) so vale na lista de sempre, sem order=board nem order=backlog.");

        var porCampo = campo switch
        {
            "number" => ReportSortField.Number,
            "state" => ReportSortField.State,
            "assignee" => ReportSortField.Assignee,
            "priority" => ReportSortField.Priority,
            "due" => ReportSortField.Due,
            "created" => ReportSortField.Created,
            "updated" => ReportSortField.Updated,
            _ => throw new ArgumentException("Ordenacao desconhecida. Use number, state, assignee, priority, due, created ou updated."),
        };

        var decrescente = direcao switch
        {
            null or "" or "asc" => false,
            "desc" => true,
            _ => throw new ArgumentException("Direcao desconhecida. Use asc ou desc."),
        };

        return new ReportListSort(porCampo, decrescente);
    }

    /// <summary>O recorte das sprints. A sprint pedida tem de ser do projeto, como todo filtro.</summary>
    private async Task<SprintScope?> ResolveSprintScopeAsync(long projectId, string? valor, CancellationToken cancellationToken)
    {
        var pedido = valor?.Trim();
        if (string.IsNullOrEmpty(pedido))
            return null;

        if (pedido.Equals("active", StringComparison.OrdinalIgnoreCase))
            return new SprintScope(SprintScopeKind.Active);
        if (pedido.Equals("backlog", StringComparison.OrdinalIgnoreCase))
            return new SprintScope(SprintScopeKind.Backlog);
        if (!Guid.TryParse(pedido, out var publicId))
            throw new ArgumentException("Sprint invalida: use active, backlog ou o identificador da sprint.");

        var sprint = await _unitOfWork.Sprints.FindAsync(projectId, publicId, cancellationToken)
                     ?? throw new KeyNotFoundException("Sprint nao encontrada neste projeto.");
        return new SprintScope(SprintScopeKind.Specific, sprint.Id);
    }

    private async Task<(IReadOnlyList<long> Pessoas, bool SemResponsavel)> ResolveAssigneesAsync(Project project, List<string>? valores, CancellationToken cancellationToken)
    {
        var pedidos = Distintos(valores);
        if (pedidos.Count == 0)
            return ([], false);

        var pessoas = new List<long>();
        var semResponsavel = false;
        IReadOnlyList<User>? time = null;

        foreach (var valor in pedidos)
        {
            switch (valor.ToLowerInvariant())
            {
                case "none":
                    semResponsavel = true;
                    break;
                case "me":
                    pessoas.Add(_accountContext.UserId ?? throw new UnauthorizedAccessException("Sessao nao identificada."));
                    break;
                default:
                    if (!Guid.TryParse(valor, out var publicId))
                        throw new ArgumentException("Responsavel invalido: use me, none ou o identificador de alguem do time.");

                    time ??= await TeamOfAsync(project.AccountId, project.Id, cancellationToken);
                    pessoas.Add(time.FirstOrDefault(pessoa => pessoa.PublicId == publicId)?.Id ?? FiltroQueSumiu);
                    break;
            }
        }

        return (pessoas.Distinct().ToList(), semResponsavel);
    }

    private async Task<IReadOnlyList<long>> ResolveLabelsAsync(long projectId, List<Guid>? valores, CancellationToken cancellationToken)
    {
        var pedidas = valores?.Distinct().ToList() ?? [];
        if (pedidas.Count == 0)
            return [];

        var achadas = await _unitOfWork.ProjectLabels.ListByPublicIdsAsync(projectId, pedidas, cancellationToken);
        var ids = achadas.Select(label => label.Id).ToList();
        if (achadas.Count != pedidas.Count)
            ids.Add(FiltroQueSumiu);

        return ids;
    }

    private async Task<(IReadOnlyList<long> Prioridades, bool SemPrioridade)> ResolvePrioritiesAsync(long projectId, List<string>? valores, CancellationToken cancellationToken)
    {
        var pedidas = Distintos(valores);
        if (pedidas.Count == 0)
            return ([], false);

        var semPrioridade = pedidas.Any(valor => valor.Equals("none", StringComparison.OrdinalIgnoreCase));
        var ids = new List<Guid>();

        foreach (var valor in pedidas.Where(valor => !valor.Equals("none", StringComparison.OrdinalIgnoreCase)))
        {
            if (!Guid.TryParse(valor, out var publicId))
                throw new ArgumentException("Prioridade invalida: use none ou o identificador da prioridade.");
            ids.Add(publicId);
        }

        if (ids.Count == 0)
            return ([], semPrioridade);

        // A aposentada entra: ela continua nos cards que ja a tinham.
        var doProjeto = await _unitOfWork.ProjectPriorities.ListByProjectAsync(projectId, cancellationToken);
        var achadas = doProjeto.Where(priority => ids.Contains(priority.PublicId)).Select(priority => priority.Id).ToList();
        if (achadas.Count != ids.Distinct().Count())
            achadas.Add(FiltroQueSumiu);

        return (achadas, semPrioridade);
    }

    /// <summary>
    /// O valor que sumiu do filtro — a etiqueta apagada, a pessoa que saiu do time, a
    /// prioridade apagada — vira um identificador que nenhum card tem: o filtro guardado
    /// na aba de alguem continua lendo (o que nao casa, nao vem), em vez de derrubar a
    /// tela inteira com 404 a cada releitura. O painel tira o valor do filtro quando ve
    /// que ele sumiu.
    /// </summary>
    private const long FiltroQueSumiu = -1;

    /// <summary>
    /// Os tipos do filtro: os identificadores dos tipos do projeto e <c>team</c>, o card
    /// do time. O tipo que sumiu vira o identificador que nenhum card tem, como a
    /// prioridade: o filtro guardado na aba continua lendo.
    /// </summary>
    private async Task<(IReadOnlyList<long> Tipos, bool DoTime)> ResolveTypesAsync(long projectId, List<string>? valores, CancellationToken cancellationToken)
    {
        var pedidos = Distintos(valores);
        if (pedidos.Count == 0)
            return ([], false);

        var doTime = pedidos.Any(valor => valor.Equals("team", StringComparison.OrdinalIgnoreCase));
        var ids = new List<Guid>();

        foreach (var valor in pedidos.Where(valor => !valor.Equals("team", StringComparison.OrdinalIgnoreCase)))
        {
            if (!Guid.TryParse(valor, out var publicId))
                throw new ArgumentException("Tipo invalido: use team ou o identificador do tipo de relato.");
            ids.Add(publicId);
        }

        if (ids.Count == 0)
            return ([], doTime);

        // O desativado entra: ele continua nos relatos que ja o tinham.
        var doProjeto = await _unitOfWork.ProjectReportTypes.ListByProjectAsync(projectId, cancellationToken);
        var achados = doProjeto.Where(tipo => ids.Contains(tipo.PublicId)).Select(tipo => tipo.Id).ToList();
        if (achados.Count != ids.Distinct().Count())
            achados.Add(FiltroQueSumiu);

        return (achados, doTime);
    }

    /// <summary>
    /// O dia do vencido. <b>E o dia de quem olha</b>, que a tela manda: no fim da noite
    /// no Brasil, o dia em UTC ja e o seguinte, e o card que vence hoje apareceria como
    /// vencido. Sem ele, vale o dia em UTC.
    /// </summary>
    private static DateOnly? ResolveOverdue(string? due, DateOnly? today)
        => due?.Trim().ToLowerInvariant() switch
        {
            null or "" => null,
            "overdue" => today ?? DateOnly.FromDateTime(DateTime.UtcNow),
            _ => throw new ArgumentException("Filtro de prazo desconhecido. Use overdue."),
        };

    /// <summary>
    /// A busca: o termo sem acento e em minusculas para o texto; o numero, quando o
    /// termo e um (<c>42</c> ou <c>#42</c>); e o protocolo, quando o que sobra do termo
    /// so com letras e digitos pode ser um pedaco de um — com ou sem hifen.
    /// </summary>
    private static ReportSearch? ResolveSearch(string? q)
    {
        var termo = q?.Trim();
        if (string.IsNullOrEmpty(termo))
            return null;

        if (termo.Length > MaxSearchLength)
            throw new ArgumentException($"A busca aceita ate {MaxSearchLength} caracteres.");

        var numero = NumeroDoCard.Match(termo) is { Success: true } achado && int.TryParse(achado.Groups[1].Value, out var n)
            ? n
            : (int?)null;

        var simbolos = new string(termo.Where(char.IsAsciiLetterOrDigit).ToArray()).ToUpperInvariant();
        var codigo = TrackingCode.CouldBeFragment(simbolos) ? simbolos : null;

        return new ReportSearch(SearchText.Fold(termo), numero, codigo);
    }

    private static List<string> Distintos(List<string>? valores)
        => valores?
               .Select(valor => valor.Trim())
               .Where(valor => valor.Length > 0)
               .Distinct(StringComparer.OrdinalIgnoreCase)
               .ToList()
           ?? [];
}
