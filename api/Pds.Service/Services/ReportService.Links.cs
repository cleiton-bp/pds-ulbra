using System.Text.Json;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.ViewModels;
using Pds.Domain.Exceptions;

namespace Pds.Service.Services;

/// <summary>
/// Os vinculos entre cards: duplicado de, bloqueia, relacionado a.
///
/// <para><b>O duplicado e o unico que muda alguma coisa.</b> Ele sai do quadro, para
/// o arquivo; e, quando e relato, quem o escreveu passa a acompanhar o original — a
/// etapa publica dele segue a do original, e o encerramento do original chega a ele
/// com o mesmo desfecho e o mesmo motivo. Bloquear so marca, e relacionar so
/// aponta.</para>
///
/// <para><b>Nada disso aparece la fora como vinculo.</b> A pagina de acompanhamento
/// continua lendo so a etapa e o encerramento do proprio relato — que agora seguem o
/// original.</para>
/// </summary>
public partial class ReportService
{
    public async Task<IReadOnlyList<CardLinkViewModel>> ListLinksAsync(Guid projectPublicId, Guid reportPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var card = await _unitOfWork.Reports.FindParentAsync(project.Id, reportPublicId, cancellationToken)
                   ?? throw new KeyNotFoundException("Card nao encontrado.");

        return await LinksOfAsync(card.Id, cancellationToken);
    }

    public async Task<IReadOnlyList<CardLinkViewModel>> LinkAsync(Guid projectPublicId, Guid reportPublicId, CreateCardLinkDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var relacao = dto.Type ?? throw new ArgumentException("Escolha o tipo do vinculo.");
        var outroPublicId = dto.TargetPublicId ?? throw new ArgumentException("Escolha o card a vincular.");

        if (!Enum.IsDefined(relacao))
            throw new ArgumentException("Tipo de vinculo desconhecido.");

        var card = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
                   ?? throw new KeyNotFoundException("Card nao encontrado.");

        var outro = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, outroPublicId, cancellationToken)
                    ?? throw new KeyNotFoundException("O card a vincular nao foi encontrado neste projeto.");

        if (card.Id == outro.Id)
            throw new ArgumentException("Um card nao se vincula a si mesmo.");

        var (de, para, tipo) = relacao switch
        {
            CardLinkRelationEnum.DuplicateOf => (card, outro, CardLinkTypeEnum.DuplicateOf),
            CardLinkRelationEnum.DuplicatedBy => (outro, card, CardLinkTypeEnum.DuplicateOf),
            CardLinkRelationEnum.Blocks => (card, outro, CardLinkTypeEnum.Blocks),
            CardLinkRelationEnum.BlockedBy => (outro, card, CardLinkTypeEnum.Blocks),
            _ => (card, outro, CardLinkTypeEnum.RelatesTo),
        };

        var avisar = new List<Guid> { de.PublicId, para.PublicId };

        // **Sob a trava do projeto, numa transacao**: as conferencias (o original, o par)
        // e a gravacao vao juntas. Sem isso, "A duplicado de B" e "B duplicado de A" ao
        // mesmo tempo passavam os dois, e nenhum original ficava no quadro.
        await _unitOfWork.InTransactionAsync(async ct =>
        {
            await _unitOfWork.Reports.LockBoardAsync(project.Id, ct);

            // **O original nao e duplicado de ninguem**: a cadeia faria o duplicado seguir um
            // card que saiu do quadro e nao anda mais. Vem antes da conferencia do arquivo —
            // todo duplicado esta la — para a recusa dizer qual e o original de verdade.
            if (tipo == CardLinkTypeEnum.DuplicateOf
                && await _unitOfWork.CardLinks.FindOriginalLinkWithoutSessionAsync(para.Id, ct) is { } doOriginal)
                throw new ConflictException($"O #{para.Number} ja e duplicado do #{doOriginal.ToReport.Number}. Marque como duplicado do #{doOriginal.ToReport.Number}.");

            // Os dois no trabalho: o arquivado se le, e nao muda.
            EnsureNotArchived(card, "vincula-lo");

            if (outro.ArchivedAt is not null)
                throw new ConflictException($"O #{outro.Number} esta arquivado. Desarquive antes de vincular.");

            // **Um vinculo por par**, em qualquer direcao: "A bloqueia B" e "B relacionado a
            // A" juntos diriam duas coisas sobre a mesma relacao. Trocar e desfazer e
            // vincular de novo.
            if (await _unitOfWork.CardLinks.FindBetweenAsync(card.Id, outro.Id, ct) is not null)
                throw new ConflictException($"Este card ja tem um vinculo com o #{outro.Number}. Desfaca o atual para trocar.");

            if (tipo == CardLinkTypeEnum.DuplicateOf)
                avisar.AddRange(await MarkDuplicateAsync(project, de, para, ct));

            await _unitOfWork.CardLinks.AddAsync(new CardLink
            {
                ProjectId = project.Id,
                FromReportId = de.Id,
                ToReportId = para.Id,
                Type = tipo,
            }, ct);

            await AddLinkEventAsync(project, de, EventTypeEnum.CardLinked, Lado(tipo, origem: true), para, EventSourceEnum.Panel, ct);
            await AddLinkEventAsync(project, para, EventTypeEnum.CardLinked, Lado(tipo, origem: false), de, EventSourceEnum.Panel, ct);

            await _unitOfWork.CommitAsync(ct);
            return true;
        }, cancellationToken);

        foreach (var publicId in avisar.Distinct())
            await _notifier.CardChangedAsync(publicId);

        return await LinksOfAsync(card.Id, cancellationToken);
    }

    public async Task<IReadOnlyList<CardLinkViewModel>> UnlinkAsync(Guid projectPublicId, Guid reportPublicId, Guid linkPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var card = await _unitOfWork.Reports.FindParentAsync(project.Id, reportPublicId, cancellationToken)
                   ?? throw new KeyNotFoundException("Card nao encontrado.");

        // Desfazer vale sempre, mesmo com o duplicado no arquivo: e o caminho de volta dele.
        var vinculo = await _unitOfWork.CardLinks.FindByPublicIdAsync(card.Id, linkPublicId, cancellationToken)
                      ?? throw new KeyNotFoundException("Vinculo nao encontrado neste card.");

        var avisar = await UndoLinkAsync(project, vinculo, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        foreach (var publicId in avisar)
            await _notifier.CardChangedAsync(publicId);

        return await LinksOfAsync(card.Id, cancellationToken);
    }

    /// <summary>
    /// Desfaz um vinculo, com o evento nos dois cards. <b>O duplicado volta do
    /// arquivo</b> — com as subtarefas que foram com ele —, a nao ser que seja
    /// subtarefa de um pai arquivado: ali ele ficaria no quadro como filho de um card
    /// que ninguem ve. Devolve os cards a avisar.
    /// </summary>
    private async Task<List<Guid>> UndoLinkAsync(Project project, CardLink vinculo, CancellationToken cancellationToken)
    {
        var de = vinculo.FromReport;
        var para = vinculo.ToReport;
        var avisar = new List<Guid> { de.PublicId, para.PublicId };

        await _unitOfWork.CardLinks.SoftDeleteAsync(vinculo, cancellationToken);

        await AddLinkEventAsync(project, de, EventTypeEnum.CardUnlinked, Lado(vinculo.Type, origem: true), para, EventSourceEnum.Panel, cancellationToken);
        await AddLinkEventAsync(project, para, EventTypeEnum.CardUnlinked, Lado(vinculo.Type, origem: false), de, EventSourceEnum.Panel, cancellationToken);

        if (vinculo.Type == CardLinkTypeEnum.DuplicateOf && de.ArchivedAt is not null
            && !(de.ParentReportId is long paiId
                 && (await _unitOfWork.Reports.GetByIdAsync(paiId, cancellationToken))?.ArchivedAt is not null))
        {
            var subtarefas = await SetArchivedWithSubtasksAsync(
                project, de, arquivar: false, EventSourceEnum.Panel,
                new { closed = false, duplicate_undone = para.Number }, cancellationToken);

            avisar.AddRange(subtarefas.Select(subtarefa => subtarefa.PublicId));
        }

        return avisar;
    }

    /// <summary>
    /// O que marcar como duplicado faz, antes de o vinculo ser gravado: confere, leva
    /// o duplicado para o arquivo, passa os duplicados dele para o original e poe o
    /// relato duplicado no passo do original. Devolve os cards a avisar, alem dos dois.
    /// </summary>
    private async Task<List<Guid>> MarkDuplicateAsync(Project project, Report duplicado, Report original, CancellationToken cancellationToken)
    {
        // **Relato so e duplicado de relato.** E do original que quem relatou recebe a
        // jornada e o desfecho, e o card do time nao tem nem um nem outro.
        if (duplicado.Kind == CardKindEnum.Report && original.Kind != CardKindEnum.Report)
            throw new ConflictException("Relato so e duplicado de outro relato: e do original que quem relatou recebe o andamento e o desfecho.");

        // A subtarefa do duplicado iria para o arquivo junto com ele.
        if (original.ParentReportId == duplicado.Id)
            throw new ConflictException("O original nao pode ser subtarefa do duplicado: ela iria para o arquivo junto.");

        // **Os duplicados dele vao junto**: passam a ser duplicados do original novo.
        var deleDuplicados = await _unitOfWork.CardLinks.ListDuplicateLinksAsync(duplicado.Id, cancellationToken);

        foreach (var vinculo in deleDuplicados)
        {
            if (await _unitOfWork.CardLinks.FindBetweenAsync(vinculo.FromReportId, original.Id, cancellationToken) is not null)
                throw new ConflictException($"O #{vinculo.FromReport.Number}, duplicado deste card, ja tem um vinculo com o #{original.Number}. Desfaca antes.");
        }

        var avisar = new List<Guid>();

        // Para o arquivo, com as subtarefas, no mesmo instante — como o arquivo de sempre.
        var subtarefas = await SetArchivedWithSubtasksAsync(
            project, duplicado, arquivar: true, EventSourceEnum.Panel,
            new { closed = false, duplicate_of = original.Number }, cancellationToken);
        avisar.AddRange(subtarefas.Select(subtarefa => subtarefa.PublicId));

        foreach (var vinculo in deleDuplicados)
        {
            var dele = vinculo.FromReport;
            vinculo.ToReportId = original.Id;
            vinculo.ToReport = original;

            await AddLinkEventAsync(project, dele, EventTypeEnum.CardUnlinked, "duplicate_of", duplicado, EventSourceEnum.Panel, cancellationToken);
            await AddLinkEventAsync(project, duplicado, EventTypeEnum.CardUnlinked, "duplicated_by", dele, EventSourceEnum.Panel, cancellationToken);
            await AddLinkEventAsync(project, dele, EventTypeEnum.CardLinked, "duplicate_of", original, EventSourceEnum.Panel, cancellationToken);
            await AddLinkEventAsync(project, original, EventTypeEnum.CardLinked, "duplicated_by", dele, EventSourceEnum.Panel, cancellationToken);

            if (dele.Kind == CardKindEnum.Report)
                await FollowOriginalAsync(project, dele, original, EventSourceEnum.Panel, _accountContext.UserId, cancellationToken);

            avisar.Add(dele.PublicId);
        }

        if (duplicado.Kind == CardKindEnum.Report)
            await FollowOriginalAsync(project, duplicado, original, EventSourceEnum.Panel, _accountContext.UserId, cancellationToken);

        return avisar;
    }

    /// <summary>
    /// Poe o relato duplicado onde o original esta para quem relatou: a mesma etapa
    /// publica, e o mesmo encerramento, se o original ja encerrou e o duplicado nao.
    /// A espera agendada do duplicado deixa de valer — a jornada dele agora e a do
    /// original.
    /// </summary>
    private async Task FollowOriginalAsync(Project project, Report duplicado, Report original, EventSourceEnum source, long? userId, CancellationToken cancellationToken)
    {
        duplicado.PublicStageDueAt = null;

        if (original.ProjectPublicStageId is long etapaId && duplicado.ProjectPublicStageId != etapaId)
        {
            var etapas = (await _unitOfWork.ProjectPublicStages
                    .ListByProjectWithoutSessionAsync(project.Id, cancellationToken))
                .ToDictionary(etapa => etapa.Id);

            if (etapas.TryGetValue(etapaId, out var destino))
                await FollowStageAsync(project, duplicado, original, destino, etapas, source, userId, cancellationToken);
        }

        var fechamento = await _unitOfWork.ReportClosures.FindCurrentWithoutSessionAsync(original.Id, cancellationToken);

        if (fechamento is not null)
            await CopyClosureAsync(project, duplicado, original, fechamento, cancellationToken);
    }

    /// <summary>
    /// A etapa do original andou: os relatos duplicados andam com ela. Chamado por quem
    /// grava a etapa — o unico lugar em que ela muda.
    /// </summary>
    private async Task FollowStageOfDuplicatesAsync(
        Project project,
        Report original,
        ProjectPublicStage destino,
        IReadOnlyDictionary<long, ProjectPublicStage> etapas,
        EventSourceEnum source,
        long? userId,
        CancellationToken cancellationToken)
    {
        // O relato que esta entrando agora ainda nao tem chave, nem duplicado.
        if (original.Id <= 0 || original.Kind != CardKindEnum.Report)
            return;

        var duplicados = await _unitOfWork.CardLinks.ListDuplicateReportsWithoutSessionAsync(original.Id, cancellationToken);

        foreach (var duplicado in duplicados.Where(duplicado => duplicado.ProjectPublicStageId != destino.Id))
            await FollowStageAsync(project, duplicado, original, destino, etapas, source, userId, cancellationToken);
    }

    /// <summary>
    /// Grava no duplicado o passo do original: o evento primeiro, com o mesmo formato
    /// do passo de sempre — e por ele que a jornada tem a data —, e o cache depois.
    /// </summary>
    private async Task FollowStageAsync(
        Project project,
        Report duplicado,
        Report original,
        ProjectPublicStage destino,
        IReadOnlyDictionary<long, ProjectPublicStage> etapas,
        EventSourceEnum source,
        long? userId,
        CancellationToken cancellationToken)
    {
        var origem = duplicado.ProjectPublicStageId is long atual && etapas.TryGetValue(atual, out var etapaAtual)
            ? etapaAtual
            : null;

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReportId = duplicado.Id,
            UserId = userId,
            Type = EventTypeEnum.ReportPublicStageChanged,
            Source = source,
            Payload = JsonSerializer.Serialize(new
            {
                from_id = origem?.PublicId,
                from_label = origem?.Label,
                to_id = destino.PublicId,
                to_label = destino.Label,
                mapping_version = project.MappingVersion,
                // De onde veio o passo: o duplicado nao andou pelo proprio quadro.
                original = original.Number,
            }),
        }, cancellationToken);

        duplicado.ProjectPublicStageId = destino.Id;
        duplicado.ProjectPublicStage = destino;
    }

    /// <summary>
    /// O original encerrou: cada relato duplicado sem encerramento recebe o mesmo
    /// desfecho, o mesmo motivo e o mesmo instante — e o instante que depois separa o
    /// encerramento que veio do original de um que o duplicado ja tinha.
    /// </summary>
    private async Task CopyClosureToDuplicatesAsync(Project project, Report original, ReportClosure fechamento, CancellationToken cancellationToken)
    {
        if (original.Id <= 0 || original.Kind != CardKindEnum.Report)
            return;

        var duplicados = await _unitOfWork.CardLinks.ListDuplicateReportsWithoutSessionAsync(original.Id, cancellationToken);

        foreach (var duplicado in duplicados)
            await CopyClosureAsync(project, duplicado, original, fechamento, cancellationToken);
    }

    private async Task CopyClosureAsync(Project project, Report duplicado, Report original, ReportClosure fechamento, CancellationToken cancellationToken)
    {
        // Ja encerrado nao encerra de novo: a pessoa ja tem o retorno dela.
        if (await _unitOfWork.ReportClosures.FindCurrentWithoutSessionAsync(duplicado.Id, cancellationToken) is not null)
            return;

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReportId = duplicado.Id,
            UserId = fechamento.ClosedByUserId,
            Type = EventTypeEnum.ReportClosed,
            Source = EventSourceEnum.Panel,
            // Como o fechamento de sempre: o desfecho e o tamanho do motivo, nunca o texto.
            Payload = JsonSerializer.Serialize(new
            {
                outcome = fechamento.Outcome.ToString(),
                reason_length = fechamento.Reason.Length,
                original = original.Number,
            }),
        }, cancellationToken);

        await _unitOfWork.ReportClosures.AddAsync(new ReportClosure
        {
            ReportId = duplicado.Id,
            Outcome = fechamento.Outcome,
            Reason = fechamento.Reason,
            ClosedByUserId = fechamento.ClosedByUserId,
            ClosedAt = fechamento.ClosedAt,
            PublicAt = fechamento.PublicAt,
        }, cancellationToken);
    }

    /// <summary>
    /// O encerramento do original deixou de valer — o time saiu da coluna que encerra,
    /// ou quem relatou o original reabriu. <b>Os duplicados voltam a esperar</b>: o
    /// encerramento que receberam dele (o mesmo instante) sai, e eles recebem o
    /// proximo. O confirmado fica, como no original: a resposta da pessoa e o dado.
    /// </summary>
    private async Task WithdrawCopiedClosuresAsync(Project project, Report original, ReportClosure fechamento, EventSourceEnum source, long? userId, CancellationToken cancellationToken)
    {
        if (original.Kind != CardKindEnum.Report)
            return;

        var duplicados = await _unitOfWork.CardLinks.ListDuplicateReportsWithoutSessionAsync(original.Id, cancellationToken);

        foreach (var duplicado in duplicados)
        {
            var copia = await _unitOfWork.ReportClosures.FindCurrentWithoutSessionAsync(duplicado.Id, cancellationToken);

            if (copia is null || copia.ConfirmedAt is not null || copia.ClosedAt != fechamento.ClosedAt)
                continue;

            await _unitOfWork.Events.AddAsync(new Event
            {
                AccountId = project.AccountId,
                ProjectId = project.Id,
                ReportId = duplicado.Id,
                UserId = userId,
                Type = EventTypeEnum.ReportClosureCancelled,
                Source = source,
                Payload = JsonSerializer.Serialize(new
                {
                    outcome = copia.Outcome.ToString(),
                    was_public = copia.PublicAt <= DateTime.UtcNow,
                    original = original.Number,
                }),
            }, cancellationToken);

            await _unitOfWork.ReportClosures.SoftDeleteAsync(copia, cancellationToken);
        }
    }

    /// <summary>
    /// Quem relatou o duplicado reabriu ou respondeu: o caso dele e dele. O vinculo
    /// vira "relacionado a" — o card volta ao quadro, e o time ainda ve de onde ele
    /// veio. Sem sessao: a acao vem da pagina de acompanhamento.
    /// </summary>
    private async Task DetachDuplicateFromOutsideAsync(Report duplicado, CancellationToken cancellationToken)
    {
        var vinculo = await _unitOfWork.CardLinks.FindOriginalLinkWithoutSessionAsync(duplicado.Id, cancellationToken);

        if (vinculo is null)
            return;

        vinculo.Type = CardLinkTypeEnum.RelatesTo;

        var project = duplicado.Project;
        var original = vinculo.ToReport;

        await AddLinkEventAsync(project, duplicado, EventTypeEnum.CardUnlinked, "duplicate_of", original, EventSourceEnum.PublicPage, cancellationToken);
        await AddLinkEventAsync(project, original, EventTypeEnum.CardUnlinked, "duplicated_by", duplicado, EventSourceEnum.PublicPage, cancellationToken);
        await AddLinkEventAsync(project, duplicado, EventTypeEnum.CardLinked, "relates_to", original, EventSourceEnum.PublicPage, cancellationToken);
        await AddLinkEventAsync(project, original, EventTypeEnum.CardLinked, "relates_to", duplicado, EventSourceEnum.PublicPage, cancellationToken);
    }

    /// <summary>
    /// Arquiva ou desarquiva o card com as subtarefas — no mesmo instante, que e o que
    /// separa, na volta, as que foram com ele das que ja estavam no arquivo. Grava um
    /// evento por card e devolve as subtarefas que foram ou voltaram.
    /// </summary>
    private async Task<List<Report>> SetArchivedWithSubtasksAsync(
        Project project,
        Report report,
        bool arquivar,
        EventSourceEnum source,
        object payload,
        CancellationToken cancellationToken)
    {
        var subtarefas = await _unitOfWork.Reports.ListSubtasksArchivedAtAsync(
            report.Id, arquivar ? null : report.ArchivedAt, cancellationToken);
        report.ArchivedAt = arquivar ? DateTime.UtcNow : null;

        var userId = source == EventSourceEnum.Panel ? _accountContext.UserId : null;

        foreach (var card in subtarefas.Prepend(report))
        {
            if (!ReferenceEquals(card, report))
                card.ArchivedAt = report.ArchivedAt;

            await _unitOfWork.Events.AddAsync(new Event
            {
                AccountId = project.AccountId,
                ProjectId = project.Id,
                ReportId = card.Id,
                UserId = userId,
                Type = arquivar ? EventTypeEnum.CardArchived : EventTypeEnum.CardUnarchived,
                Source = source,
                Payload = ReferenceEquals(card, report)
                    ? JsonSerializer.Serialize(payload)
                    : JsonSerializer.Serialize(new { closed = false, with_parent = report.Number }),
            }, cancellationToken);
        }

        return subtarefas;
    }

    /// <summary>
    /// O evento do vinculo num dos cards: o tipo visto dele e o numero do outro — o
    /// identificador vai junto para a historia nao depender do numero.
    /// </summary>
    private async Task AddLinkEventAsync(Project project, Report card, EventTypeEnum tipo, string lado, Report outro, EventSourceEnum source, CancellationToken cancellationToken)
        => await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReportId = card.Id,
            UserId = source == EventSourceEnum.Panel ? _accountContext.UserId : null,
            Type = tipo,
            Source = source,
            Payload = JsonSerializer.Serialize(new
            {
                type = lado,
                other = outro.Number,
                other_id = outro.PublicId,
            }),
        }, cancellationToken);

    /// <summary>O tipo gravado, visto de um dos lados: o de origem ou o de destino.</summary>
    private static string Lado(CardLinkTypeEnum tipo, bool origem)
        => (tipo, origem) switch
        {
            (CardLinkTypeEnum.DuplicateOf, true) => "duplicate_of",
            (CardLinkTypeEnum.DuplicateOf, false) => "duplicated_by",
            (CardLinkTypeEnum.Blocks, true) => "blocks",
            (CardLinkTypeEnum.Blocks, false) => "blocked_by",
            _ => "relates_to",
        };

    private static CardLinkRelationEnum Relacao(CardLinkTypeEnum tipo, bool origem)
        => (tipo, origem) switch
        {
            (CardLinkTypeEnum.DuplicateOf, true) => CardLinkRelationEnum.DuplicateOf,
            (CardLinkTypeEnum.DuplicateOf, false) => CardLinkRelationEnum.DuplicatedBy,
            (CardLinkTypeEnum.Blocks, true) => CardLinkRelationEnum.Blocks,
            (CardLinkTypeEnum.Blocks, false) => CardLinkRelationEnum.BlockedBy,
            _ => CardLinkRelationEnum.RelatesTo,
        };

    /// <summary>Os vinculos do card, vistos dele, na ordem em que foram feitos.</summary>
    private async Task<IReadOnlyList<CardLinkViewModel>> LinksOfAsync(long reportId, CancellationToken cancellationToken)
    {
        var vinculos = await _unitOfWork.CardLinks.ListByCardAsync(reportId, cancellationToken);

        var outros = vinculos
            .Select(vinculo => vinculo.FromReportId == reportId ? vinculo.ToReport : vinculo.FromReport)
            .ToList();
        var terminados = await _unitOfWork.Reports.ListFinishedAsync(outros.Select(outro => outro.Id).ToList(), cancellationToken);

        return vinculos.Zip(outros, (vinculo, outro) => new CardLinkViewModel(
                vinculo.PublicId,
                Relacao(vinculo.Type, origem: vinculo.FromReportId == reportId),
                new CardLinkCardViewModel(
                    outro.PublicId,
                    outro.Kind,
                    outro.Number,
                    Report.HeadlineOf(outro.Title, outro.ReporterTitle, outro.Text),
                    outro.ProjectState?.PublicId,
                    outro.ProjectState?.Name,
                    terminados.Contains(outro.Id),
                    outro.ArchivedAt)))
            .ToList();
    }
}
