using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>As preferencias de aviso da pessoa, gravadas inteiras: o volume e um som por tipo de aviso.</summary>
public class SaveNotificationSettingsDto
{
    /// <summary>O volume do som, de 0 a 100. Obrigatorio.</summary>
    /// <example>70</example>
    public int? Volume { get; set; }

    /// <summary>Um som para cada tipo de aviso — todos os tipos, cada um uma vez. Obrigatorio.</summary>
    public List<NotificationSoundDto>? Sounds { get; set; }
}

/// <summary>O som de um tipo de aviso.</summary>
public class NotificationSoundDto
{
    /// <summary>O tipo de aviso: `Mention` ou `Assignment`. Obrigatorio.</summary>
    /// <example>Mention</example>
    public NotificationKindEnum? Kind { get; set; }

    /// <summary>O som: `None`, `Bell`, `Drop`, `Ping`, `Chime`, `Bubble` ou `Soft`. Obrigatorio.</summary>
    /// <example>Ping</example>
    public NotificationSoundEnum? Sound { get; set; }
}
