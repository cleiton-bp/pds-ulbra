using System.Text.Json;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Reports;

namespace Pds.Service.Services;

public class ReportService : IReportService
{
    /// <summary>
    /// Quantas vezes tentar um protocolo novo antes de desistir. Com 32^12
    /// combinacoes, chegar na segunda tentativa ja e raro; chegar na sexta significa
    /// que alguma coisa esta errada no sorteio, e ai falhar alto e melhor do que
    /// insistir em silencio.
    /// </summary>
    private const int TrackingCodeAttempts = 5;

    /// <summary>Teto de pares de contexto por relato, para o corpo da requisicao nao virar deposito.</summary>
    private const int MaxContextEntries = 30;

    private readonly IUnitOfWork _unitOfWork;

    public ReportService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<CreatedReportViewModel> CreateAsync(CreateReportDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(dto.Key, cancellationToken);

        // Arquivar para de aceitar coisa nova sem perder o que ja entrou. E o motivo
        // de a recusa ser 403 e nao 404: o projeto existe, e a chave esta certa.
        if (project.Status == ProjectStatusEnum.Archived)
            throw new ForbiddenException("Este projeto esta arquivado e nao aceita relatos novos.");

        if (dto.Type is null)
            throw new ArgumentException("Informe o tipo do relato.");

        var text = (dto.Text ?? string.Empty).Trim();

        if (text.Length == 0)
            throw new ArgumentException("Escreva o relato.");

        if (text.Length > Report.MaxTextLength)
            throw new ArgumentException($"O relato pode ter ate {Report.MaxTextLength} caracteres.");

        var (token, tokenHash) = AccessToken.Generate();

        var report = new Report
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            TrackingCode = await GenerateTrackingCodeAsync(cancellationToken),
            AccessTokenHash = tokenHash,
            Type = dto.Type.Value,
            Text = text,
            Route = SanitizeRoute(dto.Route),
            Origin = Trim(dto.Origin, 260),
            Contexts = BuildContexts(dto.Context),
        };

        await _unitOfWork.Reports.AddAsync(report, cancellationToken);

        // O evento nasce na mesma gravacao que o relato: se ele ficasse para depois,
        // uma falha no meio deixaria relato sem evento, e a contagem da pesquisa
        // passaria a mentir em silencio.
        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            Report = report,
            Type = EventTypeEnum.ReportCreated,
            Source = EventSourceEnum.Widget,
            Payload = JsonSerializer.Serialize(new
            {
                type = report.Type.ToString().ToLowerInvariant(),
                origin = report.Origin,
                route = report.Route,
                text_length = report.Text.Length,
            }),
        }, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        return new CreatedReportViewModel(report.TrackingCode, token, report.CreatedAt);
    }

    /// <summary>
    /// Resolve o projeto pela chave publica apresentada.
    ///
    /// <para>Chave ausente, desconhecida, revogada ou secreta recebem <b>a mesma</b>
    /// recusa, com a mesma mensagem: responder "esta chave existe mas foi revogada"
    /// contaria a quem tenta que ele acertou metade.</para>
    /// </summary>
    private async Task<Project> RequireProjectAsync(string? key, CancellationToken cancellationToken)
    {
        var value = (key ?? string.Empty).Trim();

        if (value.Length > 0)
        {
            var found = await _unitOfWork.ProjectKeys.FindActivePublicAsync(value, cancellationToken);
            if (found is not null)
                return found.Project;
        }

        throw new UnauthorizedAccessException("Chave publica invalida.");
    }

    private async Task<string> GenerateTrackingCodeAsync(CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < TrackingCodeAttempts; attempt++)
        {
            var candidate = TrackingCode.Generate();

            if (!await _unitOfWork.Reports.TrackingCodeExistsAsync(candidate, cancellationToken))
                return candidate;
        }

        throw new InvalidOperationException(
            $"Nao foi possivel gerar um protocolo unico em {TrackingCodeAttempts} tentativas.");
    }

    /// <summary>
    /// Guarda so o caminho. O que vem depois do <c>?</c> ou do <c>#</c> e descartado
    /// antes de gravar: <c>?token=</c>, <c>?cpf=</c> e <c>?email=</c> sao comuns em
    /// rota, e guardar isso seria comecar o produto vazando dado de quem relatou.
    /// </summary>
    private static string? SanitizeRoute(string? route)
    {
        var value = (route ?? string.Empty).Trim();
        if (value.Length == 0)
            return null;

        value = value.Split('?', '#')[0];

        return value.Length == 0 ? null : Trim(value, 500);
    }

    private static List<ReportContext> BuildContexts(Dictionary<string, string?>? context)
    {
        if (context is null || context.Count == 0)
            return [];

        return context
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Key))
            .Take(MaxContextEntries)
            .Select(pair => new ReportContext
            {
                Key = Trim(pair.Key.Trim(), 60)!,
                Value = Trim(pair.Value, 1000),
            })
            .ToList();
    }

    /// <summary>
    /// Corta em vez de recusar. Contexto e rota vem do navegador, nao de quem
    /// digitou: recusar o relato inteiro porque um user agent veio comprido faria a
    /// pessoa perder o que escreveu por um motivo que nao e dela.
    /// </summary>
    private static string? Trim(string? value, int maxLength)
    {
        var text = (value ?? string.Empty).Trim();

        if (text.Length == 0)
            return null;

        return text.Length <= maxLength ? text : text[..maxLength];
    }
}
