namespace Pds.Domain.Enums;

/// <summary>
/// O tema do quadro no site do cliente.
///
/// <c>Auto</c> segue o <c>prefers-color-scheme</c> de quem **visita** o site, e
/// nao o do cliente: quem escolhe claro ou escuro aqui esta dizendo que o site
/// dele tem um so, e que o quadro nao deve destoar dele no meio da noite.
///
/// No banco vira texto em snake_case (auto, light, dark).
/// </summary>
public enum WidgetThemeEnum
{
    /// <summary>Acompanha o sistema de quem visita.</summary>
    Auto,

    /// <summary>Sempre claro.</summary>
    Light,

    /// <summary>Sempre escuro.</summary>
    Dark,
}
