using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Cards;

namespace Pds.Service.Services;

/// <summary>
/// Os comentarios de um relato.
///
/// <para><b>Os dois caminhos de escrita sao separados de ponta a ponta</b> — rota,
/// DTO, entidade, tabela e tipo de evento. Em nenhum ponto existe um valor que
/// decide se o texto e interno ou publico, e e essa ausencia que torna o
/// vazamento impossivel por descuido: nao ha o que preencher errado.</para>
///
/// <para><b>O evento nao carrega o texto.</b> Registra que houve comentario, e nao
/// o que foi dito. Evento so cresce e nunca e apagado — copiar o texto interno
/// para la criaria uma segunda copia do dado mais perigoso numa tabela que nao se
/// consegue limpar.</para>
/// </summary>
public class ReportCommentService : IReportCommentService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAccountContext _accountContext;

    /// <summary>A conversa muda o contador da frente do card e o card aberto dos outros.</summary>
    private readonly IWorkNotifier _notifier;

    public ReportCommentService(IUnitOfWork unitOfWork, IAccountContext accountContext, IWorkNotifier notifier)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
        _notifier = notifier;
    }

    public async Task<ReportCommentsViewModel> ListAsync(Guid projectPublicId, Guid reportPublicId, CancellationToken cancellationToken = default)
    {
        var report = await RequireReportAsync(projectPublicId, reportPublicId, cancellationToken);

        var internos = await _unitOfWork.ReportInternalComments.ListByReportAsync(report.Id, cancellationToken);
        var publicos = await _unitOfWork.ReportPublicComments.ListByReportAsync(report.Id, cancellationToken);
        var eu = _accountContext.UserId;

        return new ReportCommentsViewModel(
            internos.Select(comment => new InternalCommentViewModel(
                comment.PublicId,
                comment.User?.Name ?? string.Empty,
                comment.Body,
                comment.CreatedAt,
                EditadoEm(comment),
                comment.UserId == eu)).ToList(),
            // **`UserId` nulo e quem relatou**, e nao um autor sem nome. Os dois
            // casos existem — a conta esvaziada tambem deixa o nome nulo —, e
            // trata-los pelo mesmo sinal poria palavra de um na boca do outro.
            publicos.Select(comment => new PublicCommentViewModel(
                comment.PublicId,
                comment.UserId is null,
                comment.User?.Name,
                comment.Body,
                comment.CreatedAt)).ToList());
    }

    public async Task<InternalCommentViewModel> AddInternalAsync(Guid projectPublicId, Guid reportPublicId, CreateInternalCommentDto dto, CancellationToken cancellationToken = default)
    {
        var report = await RequireReportAsync(projectPublicId, reportPublicId, cancellationToken);
        var body = RequireBody(dto.Body, ReportInternalComment.MaxBodyLength);
        var userId = RequireUserId();

        var comment = new ReportInternalComment
        {
            ReportId = report.Id,
            UserId = userId,
            Body = body,
        };

        await _unitOfWork.ReportInternalComments.AddAsync(comment, cancellationToken);
        await AddEventAsync(report, userId, EventTypeEnum.ReportInternalCommented, cancellationToken);
        var mencionados = await NotifyMentionedAsync(report, comment, userId, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        var user = await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken);

        await _notifier.CardChangedAsync(reportPublicId);
        foreach (var pessoa in mencionados)
            await _notifier.NotificationArrivedAsync(projectPublicId, pessoa, NotificationKindEnum.Mention);

        return new InternalCommentViewModel(comment.PublicId, user?.Name ?? string.Empty, comment.Body, comment.CreatedAt, null, true);
    }

    /// <summary>
    /// Corrige o comentario interno — o "@" na pessoa errada, o erro de digitacao.
    ///
    /// <para><b>So quem escreveu.</b> O comentario e a palavra de alguem; outra pessoa
    /// mudar o que ela disse, com o nome dela em cima, seria pior do que o erro. E so o
    /// interno: o que foi para quem relatou ja saiu da empresa.</para>
    ///
    /// <para><b>As mencoes passam a ser as do texto novo.</b> Quem entrou e avisado; o
    /// aviso de quem saiu sai junto — corrigir o "@" na pessoa errada e exatamente isso.
    /// Quem continua mencionado nao e avisado de novo.</para>
    ///
    /// <para><b>Sem evento.</b> O historico registra que houve comentario, e nao o que
    /// foi dito; a correcao fica marcada no proprio comentario ("editado").</para>
    /// </summary>
    public async Task<InternalCommentViewModel> EditInternalAsync(Guid projectPublicId, Guid reportPublicId, Guid commentPublicId, EditInternalCommentDto dto, CancellationToken cancellationToken = default)
    {
        var report = await RequireReportAsync(projectPublicId, reportPublicId, cancellationToken);
        var userId = RequireUserId();
        var comment = await RequireOwnInternalAsync(report, commentPublicId, userId, cancellationToken);
        var body = RequireBody(dto.Body, ReportInternalComment.MaxBodyLength);

        IReadOnlyList<Guid> avisados = [];

        // O mesmo texto nao e correcao: nada muda, nem a marca de editado.
        if (comment.Body != body)
        {
            comment.Body = body;
            _unitOfWork.ReportInternalComments.Update(comment);
            avisados = await AcertarMencoesAsync(report, comment, userId, cancellationToken);
            await _unitOfWork.CommitAsync(cancellationToken);

            await _notifier.CardChangedAsync(reportPublicId);
            foreach (var pessoa in avisados)
                await _notifier.NotificationArrivedAsync(projectPublicId, pessoa, NotificationKindEnum.Mention);
        }

        var user = await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken);

        return new InternalCommentViewModel(
            comment.PublicId, user?.Name ?? string.Empty, comment.Body, comment.CreatedAt, EditadoEm(comment), true);
    }

    /// <summary>
    /// Apaga o comentario interno. So quem escreveu, pelo mesmo motivo da correcao.
    ///
    /// <para>Exclusao logica, como o resto: o texto sai da conversa e da contagem da
    /// frente do card. <b>Os avisos da mencao saem junto</b> — o sino nao pode levar a
    /// um comentario que ja nao existe. A linha "comentario entre o time" do historico
    /// fica: ela diz que houve comentario, e houve.</para>
    /// </summary>
    public async Task DeleteInternalAsync(Guid projectPublicId, Guid reportPublicId, Guid commentPublicId, CancellationToken cancellationToken = default)
    {
        var report = await RequireReportAsync(projectPublicId, reportPublicId, cancellationToken);
        var userId = RequireUserId();
        var comment = await RequireOwnInternalAsync(report, commentPublicId, userId, cancellationToken);

        var avisos = await _unitOfWork.Notifications.GetAllAsync(
            aviso => aviso.ReportInternalCommentId == comment.Id,
            cancellationToken: cancellationToken);

        foreach (var aviso in avisos)
            await _unitOfWork.Notifications.SoftDeleteAsync(aviso, cancellationToken);

        await _unitOfWork.ReportInternalComments.SoftDeleteAsync(comment, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.CardChangedAsync(reportPublicId);
    }

    /// <summary>
    /// As mencoes do comentario corrigido: quem passou a ser mencionado ganha o aviso, e
    /// o aviso de quem deixou de ser sai. Devolve quem foi avisado agora, para o sinal ao
    /// vivo depois da gravacao. Mesma regra da escrita: so quem esta no time, e ninguem
    /// pela propria mencao.
    /// </summary>
    private async Task<IReadOnlyList<Guid>> AcertarMencoesAsync(Report report, ReportInternalComment comment, long autorId, CancellationToken cancellationToken)
    {
        var mencionados = Mentions.Read(comment.Body);
        IReadOnlyList<User> time = mencionados.Count == 0
            ? []
            : await Team.OfProjectAsync(_unitOfWork, report.AccountId, report.ProjectId, cancellationToken);
        var agora = time
            .Where(pessoa => mencionados.Contains(pessoa.PublicId) && pessoa.Id != autorId)
            .ToList();
        var idsDeAgora = agora.Select(pessoa => pessoa.Id).ToHashSet();

        var avisos = await _unitOfWork.Notifications.GetAllAsync(
            aviso => aviso.ReportInternalCommentId == comment.Id,
            cancellationToken: cancellationToken);
        var jaAvisados = avisos.Select(aviso => aviso.UserId).ToHashSet();

        foreach (var aviso in avisos.Where(aviso => !idsDeAgora.Contains(aviso.UserId)))
            await _unitOfWork.Notifications.SoftDeleteAsync(aviso, cancellationToken);

        var avisados = new List<Guid>();

        foreach (var pessoa in agora.Where(pessoa => !jaAvisados.Contains(pessoa.Id)))
        {
            avisados.Add(pessoa.PublicId);
            await _unitOfWork.Notifications.AddAsync(new Notification
            {
                UserId = pessoa.Id,
                ProjectId = report.ProjectId,
                ReportId = report.Id,
                ActorUserId = autorId,
                Kind = NotificationKindEnum.Mention,
                ReportInternalComment = comment,
            }, cancellationToken);
        }

        return avisados;
    }

    /// <summary>O comentario interno deste relato, escrito por quem pergunta — ou a recusa.</summary>
    private async Task<ReportInternalComment> RequireOwnInternalAsync(Report report, Guid commentPublicId, long userId, CancellationToken cancellationToken)
    {
        var comment = await _unitOfWork.ReportInternalComments.GetByPublicIdAsync(commentPublicId, cancellationToken);

        if (comment is null || comment.ReportId != report.Id)
            throw new KeyNotFoundException("Comentario nao encontrado.");

        if (comment.UserId != userId)
            throw new ForbiddenException("So quem escreveu o comentario pode corrigi-lo ou apaga-lo.");

        return comment;
    }

    /// <summary>
    /// Quando o comentario foi corrigido, ou nulo se nunca foi. A data de alteracao
    /// nasce igual a de criacao; o segundo de folga e para nao marcar como editado o
    /// que so foi gravado.
    /// </summary>
    private static DateTime? EditadoEm(ReportInternalComment comment)
        => comment.UpdatedAt > comment.CreatedAt.AddSeconds(1) ? comment.UpdatedAt : null;

    public async Task<PublicCommentViewModel> AddPublicAsync(Guid projectPublicId, Guid reportPublicId, CreatePublicCommentDto dto, CancellationToken cancellationToken = default)
    {
        var report = await RequireReportAsync(projectPublicId, reportPublicId, cancellationToken);

        // O comentario publico e escrito para quem relatou. O card do time nao tem
        // essa pessoa — e um texto gravado aqui seria uma conversa sem ninguem do
        // outro lado.
        if (report.Kind == CardKindEnum.Team)
            throw new ConflictException("O card do time nao tem quem relatou para ler este comentario.");

        // Arquivado se le e se comenta entre o time; escrever para fora e mexer no
        // relato, e isso pede desarquivar antes.
        if (report.ArchivedAt is not null)
            throw new ConflictException("Desarquive o relato para escrever a quem relatou.");
        var body = RequireBody(dto.Body, ReportPublicComment.MaxBodyLength);
        var userId = RequireUserId();

        var comment = new ReportPublicComment
        {
            ReportId = report.Id,
            UserId = userId,
            Body = body,
        };

        await _unitOfWork.ReportPublicComments.AddAsync(comment, cancellationToken);
        await AddEventAsync(report, userId, EventTypeEnum.ReportPublicCommented, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.CardChangedAsync(reportPublicId);

        var user = await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken);

        // Falso: esta rota e a do painel, e quem escreve por ela e sempre do time.
        // A resposta de quem relatou entra por outra porta, sem sessao.
        return new PublicCommentViewModel(
            comment.PublicId, false, user?.Name, comment.Body, comment.CreatedAt);
    }

    /// <summary>
    /// O aviso de cada pessoa mencionada, na mesma gravacao do comentario. Devolve quem
    /// foi avisado, para o sinal ao vivo depois da gravacao.
    ///
    /// <para>So quem esta no time agora e avisado — a marca de outra pessoa fica no
    /// texto, e mais nada. E ninguem e avisado da propria mencao.</para>
    /// </summary>
    private async Task<IReadOnlyList<Guid>> NotifyMentionedAsync(Report report, ReportInternalComment comment, long autorId, CancellationToken cancellationToken)
    {
        var mencionados = Mentions.Read(comment.Body);
        if (mencionados.Count == 0)
            return [];

        var time = await Team.OfProjectAsync(_unitOfWork, report.AccountId, report.ProjectId, cancellationToken);
        var avisados = new List<Guid>();

        foreach (var pessoa in time.Where(pessoa => mencionados.Contains(pessoa.PublicId) && pessoa.Id != autorId))
        {
            avisados.Add(pessoa.PublicId);
            await _unitOfWork.Notifications.AddAsync(new Notification
            {
                UserId = pessoa.Id,
                ProjectId = report.ProjectId,
                ReportId = report.Id,
                ActorUserId = autorId,
                Kind = NotificationKindEnum.Mention,
                ReportInternalComment = comment,
            }, cancellationToken);
        }

        return avisados;
    }

    /// <summary>
    /// O evento do comentario. <b>Sem payload, de proposito</b>: tipo, momento,
    /// relato e autor ja sao colunas, e o texto nao entra — nem o publico, para o
    /// desenho nao ter uma excecao que alguem copie depois para o interno.
    /// </summary>
    private async Task AddEventAsync(Report report, long userId, EventTypeEnum type, CancellationToken cancellationToken)
        => await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = report.AccountId,
            ProjectId = report.ProjectId,
            ReportId = report.Id,
            UserId = userId,
            Type = type,
            Source = EventSourceEnum.Panel,
        }, cancellationToken);

    private static string RequireBody(string? value, int max)
    {
        var body = (value ?? string.Empty).Trim();

        if (body.Length == 0)
            throw new ArgumentException("Escreva o comentario.");

        if (body.Length > max)
            throw new ArgumentException($"O comentario pode ter ate {max} caracteres.");

        return body;
    }

    /// <summary>
    /// Comentario sem autor nao existe: as duas tabelas exigem o usuario, e a
    /// exigencia comeca aqui para a recusa ser uma mensagem e nao um erro de banco.
    /// </summary>
    private long RequireUserId()
        => _accountContext.UserId ?? throw new UnauthorizedAccessException("Sessao sem usuario.");

    private async Task<Report> RequireReportAsync(Guid projectPublicId, Guid reportPublicId, CancellationToken cancellationToken)
    {
        var project = await _unitOfWork.Projects.GetByPublicIdAsync(projectPublicId, cancellationToken)
                      ?? throw new KeyNotFoundException("Projeto nao encontrado.");

        return await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
               ?? throw new KeyNotFoundException("Relato nao encontrado.");
    }
}
