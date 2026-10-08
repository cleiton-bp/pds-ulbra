using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;

namespace Pds.Service.Services;

/// <summary>
/// Os avisos do sino, e o som de cada tipo de aviso.
///
/// <para><b>Os avisos ficam no painel</b>: o sino, e o som que a pessoa escolheu para
/// cada tipo. E-mail, so o do convite.</para>
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

    public NotificationService(IUnitOfWork unitOfWork, IAccountContext accountContext)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
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
        => Settings(await RequirePersonWithSoundsAsync(cancellationToken));

    public async Task<NotificationSettingsViewModel> SaveSettingsAsync(SaveNotificationSettingsDto dto, CancellationToken cancellationToken = default)
    {
        var volume = dto.Volume ?? throw new ArgumentException("Diga o volume do som dos avisos.");
        if (volume is < User.MinNotificationVolume or > User.MaxNotificationVolume)
            throw new ArgumentException($"O volume vai de {User.MinNotificationVolume} a {User.MaxNotificationVolume}.");

        var sons = dto.Sounds ?? throw new ArgumentException("Diga o som de cada tipo de aviso.");
        var escolhidos = new Dictionary<NotificationKindEnum, NotificationSoundEnum>();
        foreach (var som in sons)
        {
            if (som.Kind is not { } tipo || !Enum.IsDefined(tipo))
                throw new ArgumentException("Tipo de aviso desconhecido.");
            if (som.Sound is not { } escolhido || !Enum.IsDefined(escolhido))
                throw new ArgumentException("Som desconhecido.");
            if (!escolhidos.TryAdd(tipo, escolhido))
                throw new ArgumentException("Cada tipo de aviso tem um som so.");
        }

        // **Inteiras**: um tipo que faltasse ficaria com o som de antes sem ninguem ter
        // escolhido isso nesta gravacao.
        if (Enum.GetValues<NotificationKindEnum>().Any(tipo => !escolhidos.ContainsKey(tipo)))
            throw new ArgumentException("Falta o som de um tipo de aviso.");

        var pessoa = await RequirePersonWithSoundsAsync(cancellationToken);
        pessoa.NotificationVolume = volume;

        foreach (var (tipo, escolhido) in escolhidos)
        {
            var linha = pessoa.NotificationSounds.FirstOrDefault(som => som.Kind == tipo);
            if (linha is null)
                pessoa.NotificationSounds.Add(new UserNotificationSound { UserId = pessoa.Id, Kind = tipo, Sound = escolhido });
            else
                linha.Sound = escolhido;
        }

        await _unitOfWork.CommitAsync(cancellationToken);
        return Settings(pessoa);
    }

    /// <summary>O que a pessoa escolheu, e o de fabrica no tipo que ela nunca escolheu.</summary>
    private static NotificationSettingsViewModel Settings(User pessoa)
        => new(
            pessoa.NotificationVolume,
            Enum.GetValues<NotificationKindEnum>()
                .Select(tipo => new NotificationSoundViewModel(
                    tipo,
                    pessoa.NotificationSounds.FirstOrDefault(som => som.Kind == tipo)?.Sound
                    ?? NotificationSoundDefaults.For(tipo)))
                .ToList());

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

    private long RequireUserId()
        => _accountContext.UserId ?? throw new UnauthorizedAccessException("Sessao nao identificada.");

    private async Task<User> RequirePersonWithSoundsAsync(CancellationToken cancellationToken)
        => await _unitOfWork.Users.GetWithNotificationSoundsAsync(RequireUserId(), cancellationToken)
           ?? throw new UnauthorizedAccessException("Sessao nao identificada.");
}
