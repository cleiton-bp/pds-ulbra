using Microsoft.Extensions.Logging;
using Pds.Domain.Constants;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Email;

namespace Pds.Service.Services;

/// <summary>
/// Os avisos do sino, e o e-mail de quem passou a ser responsavel.
///
/// <para><b>Cada pessoa le so os proprios avisos</b>, e so dos projetos em que ainda
/// esta: o filtro global guarda o projeto, e toda consulta daqui leva a pessoa da
/// sessao. Aviso de outra pessoa nao existe — 404, como card de outro projeto.</para>
/// </summary>
public class NotificationService : INotificationService
{
    /// <summary>Quantos avisos o sino mostra. Os mais antigos continuam contando como nao lidos.</summary>
    public const int MaxListed = 50;

    private readonly IUnitOfWork _unitOfWork;
    private readonly IAccountContext _accountContext;
    private readonly IEmailSender _emailSender;
    private readonly IEmailQueue _emailQueue;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(
        IUnitOfWork unitOfWork,
        IAccountContext accountContext,
        IEmailSender emailSender,
        IEmailQueue emailQueue,
        ILogger<NotificationService> logger)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
        _emailSender = emailSender;
        _emailQueue = emailQueue;
        _logger = logger;
    }

    public async Task<NotificationListViewModel> ListAsync(CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();
        var avisos = await _unitOfWork.Notifications.ListForUserAsync(userId, MaxListed, cancellationToken);
        var naoLidos = await _unitOfWork.Notifications.CountUnreadAsync(userId, cancellationToken);

        return new NotificationListViewModel(avisos.Select(Map).ToList(), naoLidos);
    }

    public async Task<NotificationCountViewModel> CountUnreadAsync(CancellationToken cancellationToken = default)
        => new(await _unitOfWork.Notifications.CountUnreadAsync(RequireUserId(), cancellationToken));

    public async Task<NotificationCountViewModel> MarkReadAsync(Guid notificationPublicId, CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();
        var aviso = await _unitOfWork.Notifications.FindForUserAsync(userId, notificationPublicId, cancellationToken)
                    ?? throw new KeyNotFoundException("Aviso nao encontrado.");

        // Ler de novo nao e erro, e nao muda a hora da primeira leitura.
        if (aviso.ReadAt is null)
        {
            aviso.ReadAt = DateTime.UtcNow;
            await _unitOfWork.CommitAsync(cancellationToken);
        }

        return await CountUnreadAsync(cancellationToken);
    }

    public async Task<NotificationCountViewModel> MarkAllReadAsync(CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();
        await _unitOfWork.Notifications.MarkAllReadAsync(userId, DateTime.UtcNow, cancellationToken);
        return await CountUnreadAsync(cancellationToken);
    }

    public async Task<NotificationSettingsViewModel> GetSettingsAsync(CancellationToken cancellationToken = default)
    {
        var pessoa = await RequireUserAsync(cancellationToken);
        return Settings(pessoa);
    }

    public async Task<NotificationSettingsViewModel> SaveSettingsAsync(SaveNotificationSettingsDto dto, CancellationToken cancellationToken = default)
    {
        var porEmail = dto.AssignmentByEmail
                       ?? throw new ArgumentException("Diga se quer receber e-mail quando for escolhido como responsavel.");

        var pessoa = await RequireUserAsync(cancellationToken);

        if (pessoa.NotifyAssignmentByEmail != porEmail)
        {
            pessoa.NotifyAssignmentByEmail = porEmail;
            await _unitOfWork.CommitAsync(cancellationToken);
        }

        return Settings(pessoa);
    }

    public async Task SendAssignmentEmailAsync(Guid notificationPublicId, CancellationToken cancellationToken = default)
    {
        var achado = await _unitOfWork.Notifications.FindForEmailWithoutSessionAsync(notificationPublicId, cancellationToken);

        // O aviso que sumiu, a pessoa que desligou o e-mail depois de entrar na fila, a
        // que saiu do time no meio do caminho, a sem endereco: nada a mandar. E isso que
        // torna a mensagem repetida inofensiva tambem — no pior caso, um e-mail a mais.
        if (achado is not { } encontrado)
            return;

        var (aviso, aindaNoTime) = encontrado;

        if (!aindaNoTime || !aviso.User.NotifyAssignmentByEmail || string.IsNullOrWhiteSpace(aviso.User.Email))
            return;

        var painel = EnvironmentConstants.GetPanelUrl();

        if (painel is null || !_emailSender.IsAvailable)
        {
            _logger.LogWarning("Aviso de responsavel sem e-mail: servidor de e-mail ou endereco do painel nao configurados.");
            return;
        }

        var link = new Uri($"{painel.AbsoluteUri.TrimEnd('/')}/projects/{aviso.Project.PublicId}/reports/{aviso.Report.PublicId}");

        var mensagem = AssignmentEmailComposer.Compose(
            aviso.User.Email,
            PersonName(aviso.ActorUser),
            aviso.Report.Number,
            Report.HeadlineOf(aviso.Report.Title, aviso.Report.ReporterTitle, aviso.Report.Text),
            aviso.Project.Name,
            link);

        try
        {
            await _emailSender.SendAsync(mensagem, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception erro)
        {
            // **Fica no log, sem reenvio.** O aviso ja esta no sino; o e-mail e o
            // segundo caminho. O tipo, e nunca a mensagem: o servidor costuma repetir o
            // endereco de quem recebe nela.
            _logger.LogError("O e-mail de responsavel nao saiu: {Tipo}.", erro.GetType().Name);
        }
    }

    private NotificationSettingsViewModel Settings(User pessoa)
        => new(
            pessoa.NotifyAssignmentByEmail,
            _emailSender.IsAvailable && _emailQueue.IsAvailable && EnvironmentConstants.GetPanelUrl() is not null);

    private static NotificationViewModel Map(Notification aviso)
        => new(
            aviso.PublicId,
            aviso.Kind,
            aviso.CreatedAt,
            aviso.ReadAt,
            aviso.ActorUser is null ? null : PersonNameOrNull(aviso.ActorUser),
            new NotificationProjectViewModel(aviso.Project.PublicId, aviso.Project.Name),
            new CardParentViewModel(
                aviso.Report.PublicId,
                aviso.Report.Number,
                Report.HeadlineOf(aviso.Report.Title, aviso.Report.ReporterTitle, aviso.Report.Text)));

    private static string? PersonNameOrNull(User pessoa)
        => !string.IsNullOrWhiteSpace(pessoa.Name) ? pessoa.Name.Trim()
            : !string.IsNullOrWhiteSpace(pessoa.Email) ? pessoa.Email
            : null;

    private static string PersonName(User? pessoa)
        => (pessoa is null ? null : PersonNameOrNull(pessoa)) ?? "Alguém do time";

    private long RequireUserId()
        => _accountContext.UserId ?? throw new UnauthorizedAccessException("Sessao nao identificada.");

    private async Task<User> RequireUserAsync(CancellationToken cancellationToken)
        => await _unitOfWork.Users.GetByIdAsync(RequireUserId(), cancellationToken)
           ?? throw new UnauthorizedAccessException("Sessao nao identificada.");
}
