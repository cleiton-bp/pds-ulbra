using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;

namespace Pds.Service.Services;

/// <summary>
/// Os limites de relato de um projeto. O mesmo desenho das outras configuracoes: ler
/// nunca devolve vazio (sem linha, valem os de fabrica), e gravar exige todos os
/// campos — assumir o padrao no que faltou mudaria um limite sem ninguem ter
/// escolhido.
///
/// <para><b>Vale no proximo relato.</b> A entrada le a linha a cada relato; as
/// contagens que ja estao na memoria continuam, e passam a ser comparadas com o numero
/// novo.</para>
/// </summary>
public class ProjectReportLimitsService : IProjectReportLimitsService
{
    private readonly IUnitOfWork _unitOfWork;

    public ProjectReportLimitsService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<ReportLimitsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        return Map(await _unitOfWork.ProjectReportLimits.GetByProjectAsync(project.Id, cancellationToken));
    }

    public async Task<ReportLimitsViewModel> ReplaceAsync(Guid projectPublicId, ReportLimitsDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);

        // Confere tudo antes de tocar na entidade rastreada: recusar depois de escrever
        // deixaria o objeto sujo ate o fim da requisicao.
        var porPessoa = InRange(dto.PerReporter, 1, ReportLimitsDefaults.MaxPerReporter, "por pessoa a cada 10 minutos");
        var porIp = InRange(dto.PerIpPerHour, 1, ReportLimitsDefaults.MaxPerIpPerHour, "por IP por hora");
        var porEndereco = InRange(dto.PerOriginPerHour, 1, ReportLimitsDefaults.MaxPerOriginPerHour, "por endereco por hora");
        var porHora = InRange(dto.PerProjectPerHour, 1, ReportLimitsDefaults.MaxPerProjectPerHour, "do projeto por hora");
        var porDia = InRange(dto.PerProjectPerDay, 1, ReportLimitsDefaults.MaxPerProjectPerDay, "do projeto por dia");
        var intervalo = InRange(dto.MinIntervalSeconds, 0, ReportLimitsDefaults.MaxMinIntervalSeconds, "de segundos entre dois relatos");

        // O dia contem a hora: um limite diario menor que o da hora seria o da hora com
        // outro nome, e a tela mostraria dois numeros que nao dizem o que acontece.
        if (porDia < porHora)
            throw new ArgumentException("O limite do projeto por dia nao pode ser menor que o por hora.");

        var limits = await _unitOfWork.ProjectReportLimits.GetByProjectAsync(project.Id, cancellationToken);
        var novo = limits is null;
        limits ??= new ProjectReportLimits { ProjectId = project.Id };

        limits.PerReporter = porPessoa;
        limits.PerIpPerHour = porIp;
        limits.PerOriginPerHour = porEndereco;
        limits.PerProjectPerHour = porHora;
        limits.PerProjectPerDay = porDia;
        limits.MinIntervalSeconds = intervalo;

        if (novo)
            await _unitOfWork.ProjectReportLimits.AddAsync(limits, cancellationToken);
        else
            _unitOfWork.ProjectReportLimits.Update(limits);

        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(limits);
    }

    private static int InRange(int? value, int min, int max, string what)
    {
        if (value is not int numero)
            throw new ArgumentException($"Informe o limite {what}.");

        if (numero < min || numero > max)
            throw new ArgumentException($"O limite {what} vai de {min} a {max}.");

        return numero;
    }

    private static ReportLimitsViewModel Map(ProjectReportLimits? limits)
    {
        var valores = limits ?? new ProjectReportLimits();

        return new ReportLimitsViewModel(
            new ReportLimitValuesViewModel(
                valores.PerReporter,
                valores.PerIpPerHour,
                valores.PerOriginPerHour,
                valores.PerProjectPerHour,
                valores.PerProjectPerDay,
                valores.MinIntervalSeconds),
            new ReportLimitValuesViewModel(
                ReportLimitsDefaults.PerReporter,
                ReportLimitsDefaults.PerIpPerHour,
                ReportLimitsDefaults.PerOriginPerHour,
                ReportLimitsDefaults.PerProjectPerHour,
                ReportLimitsDefaults.PerProjectPerDay,
                ReportLimitsDefaults.MinIntervalSeconds),
            new ReportLimitValuesViewModel(
                ReportLimitsDefaults.MaxPerReporter,
                ReportLimitsDefaults.MaxPerIpPerHour,
                ReportLimitsDefaults.MaxPerOriginPerHour,
                ReportLimitsDefaults.MaxPerProjectPerHour,
                ReportLimitsDefaults.MaxPerProjectPerDay,
                ReportLimitsDefaults.MaxMinIntervalSeconds),
            (int)ReportLimitsDefaults.Pause.TotalMinutes);
    }

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");
}
