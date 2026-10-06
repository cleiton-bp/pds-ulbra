using System.Text.Json;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Cards;

namespace Pds.Service.Services;

/// <summary>
/// Os campos que o time da a um card: o titulo do relato, o responsavel, a
/// prioridade, as etiquetas e o prazo.
///
/// <para><b>Tudo interno.</b> Nenhuma rota publica le estes campos; o titulo que volta
/// para quem relatou e so o que ela escreveu.</para>
///
/// <para><b>Uma rota por campo</b>, e cada uma grava so o que mudou e um evento so
/// quando mudou: pedir o que ja e verdade nao e erro, e devolve o card como esta.
/// <b>Card arquivado nao muda nenhum</b> — editar pede desarquivar.</para>
/// </summary>
public partial class ReportService
{
    private static readonly IReadOnlySet<long> NinguemNoTime = new HashSet<long>();

    public Task<ReportDetailViewModel> SetTitleAsync(Guid projectPublicId, Guid reportPublicId, SetCardTitleDto dto, CancellationToken cancellationToken = default)
        => ChangeCardAsync(projectPublicId, reportPublicId, "mudar o titulo", async (project, report, ct) =>
        {
            // O titulo do card do time se edita junto da descricao, numa gravacao so — e
            // la ele e obrigatorio, enquanto aqui vazio quer dizer "volta ao de quem
            // relatou", que o card do time nao tem.
            if (report.Kind == CardKindEnum.Team)
                throw new ConflictException("O titulo do card do time se edita junto da descricao.");

            var titulo = CardText.Title(dto.Title);

            // Igual ao de quem relatou e voltar a ele: guardar a mesma frase duas vezes so
            // faria o painel dizer "reescrito" sobre o que nao mudou.
            if (titulo is not null && titulo == report.ReporterTitle)
                titulo = null;

            if (titulo == report.Title)
                return;

            report.Title = titulo;

            await AddCardEventAsync(project, report, EventTypeEnum.CardTitleChanged, new
            {
                // O tamanho, e nao o texto: esta tabela nao se apaga.
                restored = titulo is null,
                length = titulo?.Length ?? 0,
            }, ct);

            await _unitOfWork.CommitAsync(ct);
        }, cancellationToken);

    public async Task<ReportDetailViewModel> SetAssigneeAsync(Guid projectPublicId, Guid reportPublicId, SetCardAssigneeDto dto, CancellationToken cancellationToken = default)
    {
        // O aviso de quem passou a ser responsavel: no sino, na mesma gravacao; e o
        // e-mail, pela fila, depois dela.
        Notification? aviso = null;

        var detalhe = await ChangeCardAsync(projectPublicId, reportPublicId, "mudar o responsavel", async (project, report, ct) =>
        {
            // Pedir quem ja esta com o card nao e erro — nem quando a pessoa saiu do time:
            // ela continua ali como registro, e a segunda aba nao muda isso.
            if (dto.UserPublicId is Guid mesma && mesma == report.AssigneeUser?.PublicId)
                return;

            long? novo = null;

            if (dto.UserPublicId is Guid escolhido)
            {
                // **So quem esta no time agora.** Quem saiu continua nos cards que ja eram
                // dele, como registro, mas nao recebe card novo — ele nem enxerga mais o
                // projeto.
                var time = await TeamOfAsync(report.AccountId, report.ProjectId, ct);

                novo = time.FirstOrDefault(pessoa => pessoa.PublicId == escolhido)?.Id
                       ?? throw new ArgumentException("Esta pessoa nao esta no time do projeto.");
            }

            if (report.AssigneeUserId == novo)
                return;

            var antes = report.AssigneeUser?.PublicId;

            // A pessoa vem rastreada, pela leitura comum: a do time chega sem rastreio, e
            // ligada ao card assim seria gravada de novo, linha inteira.
            var depois = novo is long id ? await _unitOfWork.Users.GetByIdAsync(id, ct) : null;

            report.AssigneeUserId = novo;
            report.AssigneeUser = depois;

            await AddCardEventAsync(project, report, EventTypeEnum.CardAssigneeChanged, new
            {
                from_id = antes,
                to_id = depois?.PublicId,
            }, ct);

            // **Ninguem e avisado do que fez**: quem se escolhe ja sabe.
            if (depois is not null && depois.Id != _accountContext.UserId)
            {
                aviso = new Notification
                {
                    UserId = depois.Id,
                    ProjectId = report.ProjectId,
                    ReportId = report.Id,
                    ActorUserId = _accountContext.UserId,
                    Kind = NotificationKindEnum.Assignment,
                };
                await _unitOfWork.Notifications.AddAsync(aviso, ct);
            }

            await _unitOfWork.CommitAsync(ct);
        }, cancellationToken);

        if (aviso is not null)
            await EnqueueAssignmentEmailAsync(aviso.PublicId, cancellationToken);

        return detalhe;
    }

    /// <summary>
    /// O e-mail de quem passou a ser responsavel, na fila. **Depois da gravacao**, e
    /// sem derrubar a acao: o card ja mudou de maos e o sino ja tem o aviso — sem a
    /// fila, o e-mail so nao sai. Quem confere a preferencia e o consumidor, na hora
    /// de mandar.
    /// </summary>
    private async Task EnqueueAssignmentEmailAsync(Guid avisoPublicId, CancellationToken cancellationToken)
    {
        if (!_emailQueue.IsAvailable)
            return;

        try
        {
            await _emailQueue.EnqueueAsync(EmailJobKind.Assignment, avisoPublicId, cancellationToken);
        }
        catch (Exception)
        {
            // Engolida de proposito, como o agendamento: ver o paragrafo acima.
        }
    }

    public Task<ReportDetailViewModel> SetPriorityAsync(Guid projectPublicId, Guid reportPublicId, SetCardPriorityDto dto, CancellationToken cancellationToken = default)
        => ChangeCardAsync(projectPublicId, reportPublicId, "mudar a prioridade", async (project, report, ct) =>
        {
            ProjectPriority? nova = null;

            if (dto.PriorityPublicId is Guid escolhida)
            {
                nova = await _unitOfWork.ProjectPriorities.GetByPublicIdAsync(escolhida, ct);

                // O filtro garante o acesso ao projeto da prioridade, e nao que ela e deste.
                if (nova is null || nova.ProjectId != report.ProjectId)
                    throw new KeyNotFoundException("Prioridade nao encontrada neste projeto.");

                // A aposentada continua no card que ja a tinha — escolher a mesma de novo
                // nao e erro —, mas nao vai para outro.
                if (!nova.IsActive && nova.Id != report.PriorityId)
                    throw new ConflictException("Esta prioridade esta aposentada e nao e mais oferecida.");
            }

            if (report.PriorityId == nova?.Id)
                return;

            var antes = report.Priority;

            report.PriorityId = nova?.Id;
            report.Priority = nova;

            // Os nomes vao junto, como no estado: renomear a prioridade nao reescreve
            // o passado.
            await AddCardEventAsync(project, report, EventTypeEnum.CardPriorityChanged, new
            {
                from_id = antes?.PublicId,
                from_name = antes?.Name,
                to_id = nova?.PublicId,
                to_name = nova?.Name,
            }, ct);

            await _unitOfWork.CommitAsync(ct);
        }, cancellationToken);

    public Task<ReportDetailViewModel> SetLabelsAsync(Guid projectPublicId, Guid reportPublicId, SetCardLabelsDto dto, CancellationToken cancellationToken = default)
    {
        var pedidas = (dto.LabelPublicIds
                       ?? throw new ArgumentException("Informe as etiquetas do card. A lista vazia tira todas."))
            .Distinct()
            .ToList();

        if (pedidas.Count > Report.MaxLabelsPerCard)
            throw new ArgumentException($"Um card leva ate {Report.MaxLabelsPerCard} etiquetas.");

        return ChangeCardAsync(projectPublicId, reportPublicId, "mudar as etiquetas", async (project, report, ct) =>
        {
            var etiquetas = await _unitOfWork.ProjectLabels.ListByPublicIdsAsync(report.ProjectId, pedidas, ct);

            // Uma que nao existe neste projeto recusa a lista inteira: gravar so as que
            // existem deixaria quem pediu achando que a outra tambem entrou.
            if (etiquetas.Count != pedidas.Count)
                throw new KeyNotFoundException("Etiqueta nao encontrada neste projeto.");

            // Em ordem de nome: e a ordem que o evento guarda, e a mesma mudanca contada
            // sempre do mesmo jeito.
            var atuais = ActiveLabels(report).ToList();
            var entram = etiquetas
                .Where(etiqueta => atuais.All(link => link.ProjectLabelId != etiqueta.Id))
                .OrderBy(etiqueta => etiqueta.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
            var saem = atuais
                .Where(link => etiquetas.All(etiqueta => etiqueta.Id != link.ProjectLabelId))
                .OrderBy(link => link.ProjectLabel.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (entram.Count == 0 && saem.Count == 0)
                return;

            var agora = DateTime.UtcNow;

            // A que sai e apagada logicamente, como tudo o mais: o par volta a poder
            // entrar depois, e o indice unico so olha os que valem.
            foreach (var link in saem)
                link.DeletedAt = agora;

            foreach (var etiqueta in entram)
                report.Labels.Add(new ReportLabel { ReportId = report.Id, ProjectLabelId = etiqueta.Id, ProjectLabel = etiqueta });

            await AddCardEventAsync(project, report, EventTypeEnum.CardLabelsChanged, new
            {
                added = entram.Select(etiqueta => new { id = etiqueta.PublicId, name = etiqueta.Name }),
                removed = saem.Select(link => new { id = link.ProjectLabel.PublicId, name = link.ProjectLabel.Name }),
            }, ct);

            await _unitOfWork.CommitAsync(ct);
        }, cancellationToken);
    }

    public Task<ReportDetailViewModel> SetDueDateAsync(Guid projectPublicId, Guid reportPublicId, SetCardDueDateDto dto, CancellationToken cancellationToken = default)
    {
        // Passado e aceito — registrar um prazo que ja venceu e um registro valido —,
        // mas so dentro de um intervalo que faz sentido: o ano 1 ou o 9999 e engano
        // de digitacao, e nao prazo.
        if (dto.DueDate is DateOnly data && (data.Year < 2000 || data.Year > 2100))
            throw new ArgumentException("Escolha um prazo entre os anos 2000 e 2100.");

        return ChangeCardAsync(projectPublicId, reportPublicId, "mudar o prazo", async (project, report, ct) =>
        {
            if (report.DueDate == dto.DueDate)
                return;

            var antes = report.DueDate;
            report.DueDate = dto.DueDate;

            await AddCardEventAsync(project, report, EventTypeEnum.CardDueDateChanged, new
            {
                from = antes?.ToString("yyyy-MM-dd"),
                to = dto.DueDate?.ToString("yyyy-MM-dd"),
            }, ct);

            await _unitOfWork.CommitAsync(ct);
        }, cancellationToken);
    }

    /// <summary>
    /// Muda um campo do card deste projeto — <b>um pedido de cada vez em cada card</b>.
    /// Arquivado, recusado.
    ///
    /// <para><b>A trava vem antes da leitura.</b> O segundo pedido so le o card depois
    /// de o primeiro gravar, e conta a propria mudanca a partir do que ele deixou. Sem
    /// ela, dois conjuntos de etiquetas mandados juntos virariam a soma dos dois — e
    /// podiam passar de dez —, a mesma etiqueta pedida duas vezes bateria no indice
    /// unico (erro 500), e o mesmo pedido em duas abas gravaria dois eventos de uma
    /// mudanca so.</para>
    ///
    /// <para>A trava e so dos campos: mover, comentar e responder nao esperam por
    /// ela.</para>
    /// </summary>
    private async Task<ReportDetailViewModel> ChangeCardAsync(
        Guid projectPublicId,
        Guid reportPublicId,
        string acao,
        Func<Project, Report, CancellationToken, Task> mudar,
        CancellationToken cancellationToken)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var report = await _unitOfWork.InTransactionAsync(async ct =>
        {
            await _unitOfWork.Reports.LockCardFieldsAsync(project.Id, reportPublicId, ct);

            var card = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, ct)
                       ?? throw new KeyNotFoundException("Card nao encontrado.");

            EnsureNotArchived(card, acao);
            await mudar(project, card, ct);

            return card;
        }, cancellationToken);

        await _notifier.CardChangedAsync(report.PublicId);

        return await CardDetailAsync(project, report, cancellationToken);
    }

    private async Task<ReportDetailViewModel> CardDetailAsync(Project project, Report report, CancellationToken cancellationToken)
    {
        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);
        return await DetailOfAsync(report, regras, cancellationToken);
    }

    /// <summary>
    /// Um evento de campo do card, do painel e de quem esta na sessao. Entra na mesma
    /// gravacao que a mudanca: ou os dois, ou nenhum.
    /// </summary>
    private Task AddCardEventAsync(Project project, Report report, EventTypeEnum type, object payload, CancellationToken cancellationToken)
        => _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReportId = report.Id,
            UserId = _accountContext.UserId,
            Type = type,
            Source = EventSourceEnum.Panel,
            Payload = JsonSerializer.Serialize(payload),
        }, cancellationToken);

    /// <summary>
    /// O time do projeto agora: quem e dono da conta e quem tem linha no time. E a
    /// mesma conta da tela Membros.
    /// </summary>
    private Task<IReadOnlyList<User>> TeamOfAsync(long accountId, long projectId, CancellationToken cancellationToken)
        => Team.OfProjectAsync(_unitOfWork, accountId, projectId, cancellationToken);

    /// <summary>
    /// Quem esta no time, para marcar o responsavel que saiu. So vai ao banco quando
    /// algum dos cards tem responsavel — a lista de um projeto sem ninguem atribuido
    /// nao paga a consulta.
    /// </summary>
    private async Task<IReadOnlySet<long>> TeamIdsForAsync(IReadOnlyCollection<Report> reports, CancellationToken cancellationToken)
    {
        var comResponsavel = reports.FirstOrDefault(report => report.AssigneeUserId is not null);

        if (comResponsavel is null)
            return NinguemNoTime;

        var time = await TeamOfAsync(comResponsavel.AccountId, comResponsavel.ProjectId, cancellationToken);
        return time.Select(pessoa => pessoa.Id).ToHashSet();
    }

    /// <summary>
    /// As etiquetas que valem no card. A que acabou de sair continua na lista em
    /// memoria — apagada logicamente — ate a proxima leitura.
    /// </summary>
    private static IEnumerable<ReportLabel> ActiveLabels(Report report)
        => report.Labels.Where(link => link.DeletedAt is null && link.ProjectLabel.DeletedAt is null);

    private static CardAssigneeViewModel? AssigneeOf(Report report, IReadOnlySet<long> team)
        => report.AssigneeUser is { } pessoa
            ? new CardAssigneeViewModel(pessoa.PublicId, PersonName(pessoa), pessoa.AvatarUrl, team.Contains(pessoa.Id))
            : null;

    /// <summary>
    /// Como a pessoa aparece no card e na historia: o nome do Google, ou o e-mail de
    /// quem nao tem nome la — o mesmo jeito da lista do time, de onde ela foi
    /// escolhida.
    /// </summary>
    private static string PersonName(User pessoa) => pessoa.Name ?? pessoa.Email ?? string.Empty;

    private static CardPriorityViewModel? PriorityOf(Report report)
        => report.Priority is { } prioridade
            ? new CardPriorityViewModel(prioridade.PublicId, prioridade.Name, prioridade.Color, prioridade.IsActive)
            : null;

    /// <summary>Em ordem de nome, como na lista de etiquetas do projeto.</summary>
    private static IReadOnlyList<CardLabelViewModel> LabelsOf(Report report)
        => ActiveLabels(report)
            .Select(link => link.ProjectLabel)
            .OrderBy(etiqueta => etiqueta.Name, StringComparer.OrdinalIgnoreCase)
            .Select(etiqueta => new CardLabelViewModel(etiqueta.PublicId, etiqueta.Name, etiqueta.Color))
            .ToList();
}
