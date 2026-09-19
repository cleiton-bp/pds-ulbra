using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;

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

    public ReportCommentService(IUnitOfWork unitOfWork, IAccountContext accountContext)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
    }

    public async Task<ReportCommentsViewModel> ListAsync(Guid projectPublicId, Guid reportPublicId, CancellationToken cancellationToken = default)
    {
        var report = await RequireReportAsync(projectPublicId, reportPublicId, cancellationToken);

        var internos = await _unitOfWork.ReportInternalComments.ListByReportAsync(report.Id, cancellationToken);
        var publicos = await _unitOfWork.ReportPublicComments.ListByReportAsync(report.Id, cancellationToken);

        return new ReportCommentsViewModel(
            internos.Select(comment => new InternalCommentViewModel(
                comment.PublicId,
                comment.User?.Name ?? string.Empty,
                comment.Body,
                comment.CreatedAt)).ToList(),
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
        await _unitOfWork.CommitAsync(cancellationToken);

        var user = await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken);

        return new InternalCommentViewModel(comment.PublicId, user?.Name ?? string.Empty, comment.Body, comment.CreatedAt);
    }

    public async Task<PublicCommentViewModel> AddPublicAsync(Guid projectPublicId, Guid reportPublicId, CreatePublicCommentDto dto, CancellationToken cancellationToken = default)
    {
        var report = await RequireReportAsync(projectPublicId, reportPublicId, cancellationToken);
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

        var user = await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken);

        // Falso: esta rota e a do painel, e quem escreve por ela e sempre do time.
        // A resposta de quem relatou entra por outra porta, sem sessao.
        return new PublicCommentViewModel(
            comment.PublicId, false, user?.Name, comment.Body, comment.CreatedAt);
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
