using System.Text.Json;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Filters;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Cards;

namespace Pds.Service.Services;

/// <summary>
/// As sprints do projeto: planejar, iniciar, fechar e apagar.
///
/// <para><b>Uma em andamento por vez</b> — e a que o quadro mostra —, e quantas
/// planejadas o time quiser. <b>Fechar decide o destino do que nao terminou</b>: o
/// backlog, uma sprint planejada ou uma nova; o que terminou fica na fechada, para a
/// historia.</para>
///
/// <para>E trabalho do time, e nao configuracao: qualquer pessoa do time planeja. Quem
/// liga as sprints e o administrador, no Ciclo.</para>
/// </summary>
public class SprintService : ISprintService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAccountContext _accountContext;
    private readonly IWorkNotifier _notifier;

    public SprintService(IUnitOfWork unitOfWork, IAccountContext accountContext, IWorkNotifier notifier)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
        _notifier = notifier;
    }

    public async Task<IReadOnlyList<SprintViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var sprints = await _unitOfWork.Sprints.ListOpenAsync(project.Id, cancellationToken);
        var numeros = await _unitOfWork.Reports.CountSprintsAsync(sprints.Select(sprint => sprint.Id).ToList(), cancellationToken);

        return sprints.Select(sprint => Map(sprint, numeros.GetValueOrDefault(sprint.Id, SprintStats.Empty))).ToList();
    }

    public async Task<SprintViewModel> CreateAsync(Guid projectPublicId, SaveSprintDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var regras = await RequireSprintsAsync(project.Id, cancellationToken);

        var sprint = await NewPlannedAsync(project, regras, dto, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.ProjectChangedAsync(project.PublicId);
        return Map(sprint, SprintStats.Empty);
    }

    public async Task<SprintViewModel> UpdateAsync(Guid projectPublicId, Guid sprintPublicId, SaveSprintDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var sprint = await RequireSprintAsync(project.Id, sprintPublicId, cancellationToken);

        if (sprint.State == SprintStateEnum.Closed)
            throw new ConflictException("A sprint fechada nao muda: ela e a historia do que aconteceu.");

        sprint.Name = RequireName(dto.Name);
        sprint.Goal = NormalizeGoal(dto.Goal);
        (sprint.StartsOn, sprint.EndsOn) = RequireDates(
            dto.StartsOn ?? throw new ArgumentException("Informe o primeiro dia da sprint."),
            dto.EndsOn ?? throw new ArgumentException("Informe o ultimo dia da sprint."));

        await _unitOfWork.CommitAsync(cancellationToken);
        await _notifier.ProjectChangedAsync(project.PublicId);

        return await MapWithStatsAsync(sprint, cancellationToken);
    }

    public async Task<SprintViewModel> StartAsync(Guid projectPublicId, Guid sprintPublicId, SaveSprintDto? dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        await RequireSprintsAsync(project.Id, cancellationToken);

        var sprint = await _unitOfWork.InTransactionAsync(async ct =>
        {
            // A trava da ordem do projeto serializa quem inicia ao mesmo tempo; o indice
            // unico segura o resto.
            await _unitOfWork.Reports.LockBoardAsync(project.Id, ct);

            var alvo = await RequireSprintAsync(project.Id, sprintPublicId, ct);

            if (alvo.State != SprintStateEnum.Planned)
                throw new ConflictException(alvo.State == SprintStateEnum.Active
                    ? "Esta sprint ja esta em andamento."
                    : "A sprint fechada nao volta a andar.");

            if (await _unitOfWork.Sprints.FindActiveAsync(project.Id, ct) is { } emAndamento)
                throw new ConflictException($"A {emAndamento.Name} esta em andamento. Conclua-a antes de iniciar outra.");

            // O que vier no pedido vale para a sprint que comeca — o dialogo de iniciar
            // ajusta nome, objetivo e datas.
            if (dto is not null)
            {
                if (dto.Name is not null)
                    alvo.Name = RequireName(dto.Name);
                if (dto.Goal is not null)
                    alvo.Goal = NormalizeGoal(dto.Goal);
                (alvo.StartsOn, alvo.EndsOn) = RequireDates(dto.StartsOn ?? alvo.StartsOn, dto.EndsOn ?? alvo.EndsOn);
            }

            alvo.State = SprintStateEnum.Active;
            alvo.StartedAt = DateTime.UtcNow;

            var numeros = (await _unitOfWork.Reports.CountSprintsAsync([alvo.Id], ct)).GetValueOrDefault(alvo.Id, SprintStats.Empty);
            await AddSprintEventAsync(project, EventTypeEnum.SprintStarted, new
            {
                sprint_id = alvo.PublicId,
                name = alvo.Name,
                starts_on = alvo.StartsOn.ToString("yyyy-MM-dd"),
                ends_on = alvo.EndsOn.ToString("yyyy-MM-dd"),
                cards = numeros.Cards,
                points = numeros.Points,
            }, ct);

            await _unitOfWork.CommitAsync(ct);
            return alvo;
        }, cancellationToken);

        await _notifier.ProjectChangedAsync(project.PublicId);
        return await MapWithStatsAsync(sprint, cancellationToken);
    }

    public async Task<CloseSprintResultViewModel> CloseAsync(Guid projectPublicId, Guid sprintPublicId, CloseSprintDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var destinoTipo = dto.Destination ?? throw new ArgumentException("Diga para onde vai o que nao terminou.");

        if (!Enum.IsDefined(destinoTipo))
            throw new ArgumentException("Destino desconhecido. Use Backlog, Sprint ou NewSprint.");

        var movidos = new List<Report>();
        Sprint? destino = null;
        SprintStats numeros = SprintStats.Empty;

        var sprint = await _unitOfWork.InTransactionAsync(async ct =>
        {
            await _unitOfWork.Reports.LockBoardAsync(project.Id, ct);

            var alvo = await RequireSprintAsync(project.Id, sprintPublicId, ct);
            if (alvo.State != SprintStateEnum.Active)
                throw new ConflictException("So a sprint em andamento se conclui.");

            destino = destinoTipo switch
            {
                SprintCloseDestinationEnum.Sprint => await RequirePlannedDestinationAsync(project.Id, dto.SprintPublicId, alvo, ct),
                SprintCloseDestinationEnum.NewSprint => await NewPlannedAsync(
                    project, await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, ct), new SaveSprintDto(), ct),
                _ => null,
            };

            // A sprint nova ganha a chave antes de receber os cards.
            if (destinoTipo == SprintCloseDestinationEnum.NewSprint)
                await _unitOfWork.CommitAsync(ct);

            // Os numeros de quando fechou — antes de o que nao terminou sair dela.
            numeros = (await _unitOfWork.Reports.CountSprintsAsync([alvo.Id], ct)).GetValueOrDefault(alvo.Id, SprintStats.Empty);

            var cards = await _unitOfWork.Reports.ListSprintCardsAsync(alvo.Id, ct);
            var terminados = await _unitOfWork.Reports.ListFinishedAsync(cards.Select(card => card.Id).ToList(), ct);

            // **O pai terminado com subtarefa aberta tambem vai**: a subtarefa acompanha o
            // pai, e ficar na concluida a tiraria do quadro e do backlog, sem como move-la.
            var aMover = new List<Report>();
            foreach (var card in cards)
            {
                if (!terminados.Contains(card.Id))
                {
                    aMover.Add(card);
                    continue;
                }

                var subtarefas = await _unitOfWork.Reports.ListSubtasksAsync(card.Id, ct);
                if (subtarefas.Count == 0)
                    continue;
                var feitas = await _unitOfWork.Reports.ListFinishedAsync(subtarefas.Select(sub => sub.Id).ToList(), ct);
                if (subtarefas.Any(sub => !feitas.Contains(sub.Id)))
                    aMover.Add(card);
            }

            // No fim da lista de destino, na ordem em que estavam.
            var fim = await _unitOfWork.Reports.FindBacklogEdgeRankAsync(project.Id, destino?.Id, top: false, exceptId: 0, ct) ?? 0;
            foreach (var card in aMover)
            {
                fim = Report.BacklogAfter(fim, project.LastCardNumber);
                card.BacklogRank = fim;
                var foram = await SprintMoves.MoveAsync(_unitOfWork, project, card, destino, _accountContext.UserId, "sprint_closed", ct);
                movidos.Add(card);
                movidos.AddRange(foram);
            }

            alvo.State = SprintStateEnum.Closed;
            alvo.ClosedAt = DateTime.UtcNow;

            await AddSprintEventAsync(project, EventTypeEnum.SprintClosed, new
            {
                sprint_id = alvo.PublicId,
                name = alvo.Name,
                cards = numeros.Cards,
                done_cards = numeros.DoneCards,
                points = numeros.Points,
                done_points = numeros.DonePoints,
                moved = aMover.Count,
                destination = destinoTipo.ToString(),
                destination_id = destino?.PublicId,
            }, ct);

            await _unitOfWork.CommitAsync(ct);
            return alvo;
        }, cancellationToken);

        foreach (var card in movidos)
            await _notifier.CardChangedAsync(card.PublicId);
        await _notifier.ProjectChangedAsync(project.PublicId);

        var naoTerminaram = numeros.Cards - numeros.DoneCards;
        return new CloseSprintResultViewModel(
            Map(sprint, numeros),
            naoTerminaram,
            destino is null ? null : await MapWithStatsAsync(destino, cancellationToken));
    }

    public async Task DeleteAsync(Guid projectPublicId, Guid sprintPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var movidos = new List<Report>();

        await _unitOfWork.InTransactionAsync(async ct =>
        {
            await _unitOfWork.Reports.LockBoardAsync(project.Id, ct);

            var alvo = await RequireSprintAsync(project.Id, sprintPublicId, ct);

            // So a planejada se apaga: a em andamento fecha, e a fechada e a historia.
            if (alvo.State != SprintStateEnum.Planned)
                throw new ConflictException(alvo.State == SprintStateEnum.Active
                    ? "A sprint em andamento nao se apaga: conclua-a."
                    : "A sprint fechada nao se apaga: ela e a historia do que aconteceu.");

            // Os cards voltam para o fim do backlog, na ordem em que estavam.
            var fim = await _unitOfWork.Reports.FindBacklogEdgeRankAsync(project.Id, null, top: false, exceptId: 0, ct) ?? 0;
            foreach (var card in await _unitOfWork.Reports.ListSprintCardsAsync(alvo.Id, ct))
            {
                fim = Report.BacklogAfter(fim, project.LastCardNumber);
                card.BacklogRank = fim;
                movidos.Add(card);
                movidos.AddRange(await SprintMoves.MoveAsync(_unitOfWork, project, card, null, _accountContext.UserId, "sprint_deleted", ct));
            }

            // O arquivado que estava nela tambem sai: a sprint deixa de existir.
            foreach (var arquivado in await _unitOfWork.Reports.ListArchivedSprintCardsAsync(alvo.Id, ct))
            {
                movidos.Add(arquivado);
                movidos.AddRange(await SprintMoves.MoveAsync(_unitOfWork, project, arquivado, null, _accountContext.UserId, "sprint_deleted", ct));
            }

            await _unitOfWork.Sprints.SoftDeleteAsync(alvo, ct);
            await _unitOfWork.CommitAsync(ct);
            return true;
        }, cancellationToken);

        foreach (var card in movidos)
            await _notifier.CardChangedAsync(card.PublicId);
        await _notifier.ProjectChangedAsync(project.PublicId);
    }

    /// <summary>
    /// Uma sprint planejada nova: o proximo numero, o nome de fabrica, e as datas logo
    /// depois da ultima que nao fechou (ou a partir de hoje), com a duracao do projeto.
    /// Nao grava: quem chama confirma.
    /// </summary>
    private async Task<Sprint> NewPlannedAsync(Project project, ProjectCycleSettings? regras, SaveSprintDto dto, CancellationToken cancellationToken)
    {
        var hoje = DateOnly.FromDateTime(DateTime.UtcNow);
        var ultimoFim = await _unitOfWork.Sprints.FindLastEndAsync(project.Id, cancellationToken);
        var inicio = dto.StartsOn ?? (ultimoFim is DateOnly fim && fim >= hoje ? fim.AddDays(1) : hoje);
        var semanas = regras?.SprintLengthWeeks ?? CycleSettingsDefaults.SprintLengthWeeks;
        var (comeca, termina) = RequireDates(inicio, dto.EndsOn ?? inicio.AddDays(semanas * 7 - 1));

        var numero = await _unitOfWork.Projects.NextSprintNumberAsync(project.Id, cancellationToken);

        var sprint = new Sprint
        {
            ProjectId = project.Id,
            Number = numero,
            Name = dto.Name is null ? $"Sprint {numero}" : RequireName(dto.Name),
            Goal = NormalizeGoal(dto.Goal),
            State = SprintStateEnum.Planned,
            StartsOn = comeca,
            EndsOn = termina,
        };

        await _unitOfWork.Sprints.AddAsync(sprint, cancellationToken);
        return sprint;
    }

    private async Task<Sprint> RequirePlannedDestinationAsync(long projectId, Guid? publicId, Sprint fechando, CancellationToken cancellationToken)
    {
        var id = publicId ?? throw new ArgumentException("Escolha a sprint planejada que recebe o que nao terminou.");
        var sprint = await RequireSprintAsync(projectId, id, cancellationToken);

        return sprint.Id == fechando.Id || sprint.State != SprintStateEnum.Planned
            ? throw new ConflictException("O que nao terminou vai para o backlog, para uma sprint planejada ou para uma nova.")
            : sprint;
    }

    private Task AddSprintEventAsync(Project project, EventTypeEnum tipo, object payload, CancellationToken cancellationToken)
        => _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            UserId = _accountContext.UserId,
            Type = tipo,
            Source = EventSourceEnum.Panel,
            Payload = JsonSerializer.Serialize(payload),
        }, cancellationToken);

    private async Task<SprintViewModel> MapWithStatsAsync(Sprint sprint, CancellationToken cancellationToken)
        => Map(sprint, (await _unitOfWork.Reports.CountSprintsAsync([sprint.Id], cancellationToken)).GetValueOrDefault(sprint.Id, SprintStats.Empty));

    private static SprintViewModel Map(Sprint sprint, SprintStats numeros)
        => new(
            sprint.PublicId,
            sprint.Number,
            sprint.Name,
            sprint.Goal,
            sprint.State,
            sprint.StartsOn,
            sprint.EndsOn,
            sprint.StartedAt,
            sprint.ClosedAt,
            numeros.Cards,
            numeros.DoneCards,
            numeros.Points,
            numeros.DonePoints);

    private static string RequireName(string? valor)
    {
        var nome = string.Join(' ', (valor ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

        if (nome.Length == 0)
            throw new ArgumentException("De um nome a sprint.");
        if (nome.Length > Sprint.MaxNameLength)
            throw new ArgumentException($"O nome da sprint tem ate {Sprint.MaxNameLength} caracteres.");

        return nome;
    }

    private static string? NormalizeGoal(string? valor)
    {
        var objetivo = (valor ?? string.Empty).Trim();

        if (objetivo.Length > Sprint.MaxGoalLength)
            throw new ArgumentException($"O objetivo da sprint tem ate {Sprint.MaxGoalLength} caracteres.");

        return objetivo.Length == 0 ? null : objetivo.Replace("\r\n", "\n");
    }

    private static (DateOnly, DateOnly) RequireDates(DateOnly comeca, DateOnly termina)
    {
        if (comeca.Year < 2000 || termina.Year > 2100)
            throw new ArgumentException("Escolha datas entre os anos 2000 e 2100.");
        if (termina < comeca)
            throw new ArgumentException("O ultimo dia da sprint vem depois do primeiro.");
        if (termina.DayNumber - comeca.DayNumber > 365)
            throw new ArgumentException("Uma sprint dura ate um ano.");

        return (comeca, termina);
    }

    private async Task<ProjectCycleSettings> RequireSprintsAsync(long projectId, CancellationToken cancellationToken)
    {
        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(projectId, cancellationToken);
        return regras is { SprintsEnabled: true }
            ? regras
            : throw new ConflictException("Este projeto nao trabalha em sprints. O administrador liga no Ciclo.");
    }

    private async Task<Sprint> RequireSprintAsync(long projectId, Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Sprints.FindAsync(projectId, publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Sprint nao encontrada neste projeto.");

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");
}
