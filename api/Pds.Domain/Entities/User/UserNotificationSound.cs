using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O som que a pessoa escolheu para um tipo de aviso — a mencao com um, a escolha como
/// responsavel com outro. Sem linha para um tipo, vale o de fabrica
/// (<see cref="NotificationSoundDefaults"/>). Vale em todos os projetos dela.
/// </summary>
public class UserNotificationSound : PdsBaseEntity
{
    public long UserId { get; set; }
    public User User { get; set; } = null!;

    public NotificationKindEnum Kind { get; set; }

    public NotificationSoundEnum Sound { get; set; }
}

/// <summary>Os sons e o volume de fabrica, para quem ainda nao escolheu.</summary>
public static class NotificationSoundDefaults
{
    /// <summary>O volume de fabrica, de 0 a 100.</summary>
    public const int Volume = 70;

    /// <summary>O som de fabrica de cada tipo de aviso.</summary>
    public static NotificationSoundEnum For(NotificationKindEnum kind) => kind switch
    {
        NotificationKindEnum.Mention => NotificationSoundEnum.Ping,
        NotificationKindEnum.Assignment => NotificationSoundEnum.Bell,
        _ => NotificationSoundEnum.None,
    };
}
