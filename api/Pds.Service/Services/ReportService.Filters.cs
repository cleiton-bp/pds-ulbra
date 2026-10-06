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
        var (tipos, doTime) = ResolveTypes(dto.Type);

        return new ReportCardFilter(
            pessoas, semResponsavel, etiquetas, prioridades, semPrioridade, tipos, doTime,
            ResolveOverdue(dto.Due, dto.Today), ResolveSearch(dto.Q));
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
                    pessoas.Add(time.FirstOrDefault(pessoa => pessoa.PublicId == publicId)?.Id
                                ?? throw new KeyNotFoundException("Pessoa nao encontrada no time deste projeto."));
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
        if (achadas.Count != pedidas.Count)
            throw new KeyNotFoundException("Etiqueta nao encontrada neste projeto.");

        return achadas.Select(label => label.Id).ToList();
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
            throw new KeyNotFoundException("Prioridade nao encontrada neste projeto.");

        return (achadas, semPrioridade);
    }

    private static (IReadOnlyList<ReportTypeEnum> Tipos, bool DoTime) ResolveTypes(List<string>? valores)
    {
        var tipos = new List<ReportTypeEnum>();
        var doTime = false;

        foreach (var valor in Distintos(valores))
        {
            switch (valor.ToLowerInvariant())
            {
                case "bug":
                    tipos.Add(ReportTypeEnum.Bug);
                    break;
                case "improvement":
                    tipos.Add(ReportTypeEnum.Improvement);
                    break;
                case "question":
                    tipos.Add(ReportTypeEnum.Question);
                    break;
                case "team":
                    doTime = true;
                    break;
                default:
                    throw new ArgumentException("Tipo invalido: use bug, improvement, question ou team.");
            }
        }

        return (tipos.Distinct().ToList(), doTime);
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
