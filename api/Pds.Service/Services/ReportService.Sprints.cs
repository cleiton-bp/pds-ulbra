using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Filters;
using Pds.Domain.ViewModels;
using Pds.Service.Cards;

namespace Pds.Service.Services;

/// <summary>
/// O card no trabalho em sprints: em qual sprint esta (ou no backlog), o lugar dele na
/// lista, e a estimativa em pontos. So com a sprint ligada no projeto.
/// </summary>
public partial class ReportService
{
    public async Task<ReportDetailViewModel> SetSprintAsync(Guid projectPublicId, Guid reportPublicId, SetCardSprintDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var regras = await RequireSprintsAsync(project.Id, cancellationToken);

        var report = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
                     ?? throw new KeyNotFoundException("Card nao encontrado.");

        EnsureNotArchived(report, "planeja-lo");

        // **A subtarefa acompanha o pai**: ela vai e volta com ele.
        if (report.ParentReportId is not null)
            throw new ConflictException("A subtarefa acompanha o pai: mude a sprint do pai.");

        Sprint? destino = null;
        if (dto.SprintPublicId is Guid sprintId)
        {
            destino = await _unitOfWork.Sprints.FindAsync(project.Id, sprintId, cancellationToken)
                      ?? throw new KeyNotFoundException("Sprint nao encontrada neste projeto.");

            if (destino.State == SprintStateEnum.Closed)
                throw new ConflictException("Esta sprint ja fechou e nao recebe card.");
        }

        var foram = new List<Report>();

        // Sob a trava da ordem do projeto, como o quadro: o lugar e contado sobre os
        // vizinhos, e a leitura, a conta e a gravacao vao juntas.
        await _unitOfWork.InTransactionAsync(async ct =>
        {
            await _unitOfWork.Reports.LockBoardAsync(project.Id, ct);

            var aqui = await _unitOfWork.Reports.FindBacklogSpotAsync(project.Id, report.PublicId, ct)
                       ?? throw new KeyNotFoundException("Card nao encontrado.");
            if (aqui.Archived)
                throw new ConflictException("O card saiu para o arquivo. Atualize o backlog.");

            report.BacklogRank = dto.AfterPublicId is Guid acima
                ? await BacklogRankBelowAsync(project.Id, destino?.Id, acima, report.Id, ct)
                : await BacklogEdgeRankAsync(project.Id, destino?.Id, dto.Top == true, report, ct);

            foram = await SprintMoves.MoveAsync(_unitOfWork, project, report, destino, _accountContext.UserId, null, ct);

            await _unitOfWork.CommitAsync(ct);
            return true;
        }, cancellationToken);

        await _notifier.CardChangedAsync(report.PublicId);
        foreach (var subtarefa in foram)
            await _notifier.CardChangedAsync(subtarefa.PublicId);

        return await DetailOfAsync(report, regras, cancellationToken);
    }

    public Task<ReportDetailViewModel> SetPointsAsync(Guid projectPublicId, Guid reportPublicId, SetCardPointsDto dto, CancellationToken cancellationToken = default)
    {
        if (dto.Points is decimal pontos
            && (pontos < 0 || pontos > Report.MaxStoryPoints || pontos * 2 != decimal.Truncate(pontos * 2)))
            throw new ArgumentException($"A estimativa vai de 0 a {Report.MaxStoryPoints:0}, de meio em meio ponto.");

        return ChangeCardAsync(projectPublicId, reportPublicId, "estima-lo", async (project, report, ct) =>
        {
            await RequireSprintsAsync(project.Id, ct);

            // Os pontos sao do card que o time planeja; a subtarefa vai com ele.
            if (report.ParentReportId is not null)
                throw new ConflictException("A subtarefa nao leva pontos: estime o card pai.");

            if (report.StoryPoints == dto.Points)
                return;

            var antes = report.StoryPoints;
            report.StoryPoints = dto.Points;

            await AddCardEventAsync(project, report, EventTypeEnum.CardPointsChanged, new
            {
                from = antes,
                to = dto.Points,
            }, ct);

            await _unitOfWork.CommitAsync(ct);
        }, cancellationToken);
    }

    /// <summary>
    /// A sprint em que o card do time nasce. A subtarefa vai para a do pai; o card
    /// criado numa coluna do quadro, para a que veio — que tem de estar aberta.
    /// </summary>
    private async Task<Sprint?> ResolveCreateSprintAsync(long projectId, Report? pai, Guid? sprintPublicId, CancellationToken cancellationToken)
    {
        if (pai is not null)
            return pai.SprintId is long paiSprint ? await _unitOfWork.Sprints.GetByIdAsync(paiSprint, cancellationToken) : null;

        if (sprintPublicId is not Guid id)
            return null;

        await RequireSprintsAsync(projectId, cancellationToken);

        var sprint = await _unitOfWork.Sprints.FindAsync(projectId, id, cancellationToken)
                     ?? throw new KeyNotFoundException("Sprint nao encontrada neste projeto.");

        return sprint.State == SprintStateEnum.Closed
            ? throw new ConflictException("Esta sprint ja fechou e nao recebe card.")
            : sprint;
    }

    /// <summary>A configuracao do ciclo, quando o projeto trabalha em sprints — senao, a recusa.</summary>
    private async Task<ProjectCycleSettings> RequireSprintsAsync(long projectId, CancellationToken cancellationToken)
    {
        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(projectId, cancellationToken);
        return regras is { SprintsEnabled: true }
            ? regras
            : throw new ConflictException("Este projeto nao trabalha em sprints. O administrador liga no Ciclo.");
    }

    /// <summary>O topo ou o fim da lista de destino, sem o card que se move. Lista vazia: o lugar que ele ja tem.</summary>
    private async Task<long> BacklogEdgeRankAsync(long projectId, long? sprintId, bool top, Report report, CancellationToken cancellationToken)
    {
        var borda = await _unitOfWork.Reports.FindBacklogEdgeRankAsync(projectId, sprintId, top, report.Id, cancellationToken);
        if (borda is not long valor)
            return report.BacklogRank;
        return top ? valor - Report.BoardRankGap : valor + Report.BoardRankGap;
    }

    /// <summary>
    /// Logo abaixo do card de referencia, na lista de destino — o mesmo desenho da ordem
    /// do quadro: o meio entre ele e o vizinho de baixo, e sem folga a lista e
    /// renumerada. A referencia precisa estar na lista: a tela pode estar velha.
    /// </summary>
    private async Task<long> BacklogRankBelowAsync(long projectId, long? sprintId, Guid acima, long movingId, CancellationToken cancellationToken)
    {
        var referencia = await _unitOfWork.Reports.FindBacklogSpotAsync(projectId, acima, cancellationToken)
                         ?? throw new KeyNotFoundException("O card de referencia nao foi encontrado neste projeto.");

        if (referencia.Id == movingId)
            throw new ArgumentException("O card nao fica abaixo dele mesmo.");

        if (!NaLista(referencia, sprintId))
            throw new ConflictException("O card de referencia nao esta mais nesta lista. Atualize o backlog e solte de novo.");

        var abaixo = await _unitOfWork.Reports.FindBacklogRankBelowAsync(projectId, sprintId, referencia.Rank, referencia.Id, movingId, cancellationToken);

        if (abaixo is null)
            return referencia.Rank + Report.BoardRankGap;
        if (abaixo.Value - referencia.Rank >= 2)
            return referencia.Rank + (abaixo.Value - referencia.Rank) / 2;

        await _unitOfWork.Reports.RenumberBacklogAsync(projectId, sprintId, movingId, cancellationToken);

        referencia = await _unitOfWork.Reports.FindBacklogSpotAsync(projectId, acima, cancellationToken)
                     ?? throw new KeyNotFoundException("O card de referencia nao foi encontrado neste projeto.");
        abaixo = await _unitOfWork.Reports.FindBacklogRankBelowAsync(projectId, sprintId, referencia.Rank, referencia.Id, movingId, cancellationToken);

        return abaixo is long vizinho
            ? referencia.Rank + (vizinho - referencia.Rank) / 2
            : referencia.Rank + Report.BoardRankGap;
    }

    private static bool NaLista(BacklogSpot spot, long? sprintId)
        => spot.SprintId == sprintId && spot.ParentId is null && !spot.Archived;
}
