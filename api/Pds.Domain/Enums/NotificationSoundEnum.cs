namespace Pds.Domain.Enums;

/// <summary>
/// O som que toca no painel quando chega um aviso. Os sons sao gerados no navegador,
/// sem arquivo de audio: aqui fica so o nome de cada um.
/// </summary>
public enum NotificationSoundEnum
{
    /// <summary>Sem som: o aviso chega so no sino.</summary>
    None,

    /// <summary>Sino.</summary>
    Bell,

    /// <summary>Gota.</summary>
    Drop,

    /// <summary>Plim.</summary>
    Ping,

    /// <summary>Campainha.</summary>
    Chime,

    /// <summary>Bolha.</summary>
    Bubble,

    /// <summary>Suave.</summary>
    Soft,
}
