namespace Pds.Domain.Enums;

/// <summary>
/// A duracao do movimento do formulario ao abrir e fechar. Os milissegundos de cada uma
/// moram na ferramenta, que e quem anima.
///
/// No banco vira texto em snake_case (fast, normal, slow).
/// </summary>
public enum WidgetAnimationSpeedEnum
{
    /// <summary>Rapida.</summary>
    Fast,

    /// <summary>Normal. Padrao.</summary>
    Normal,

    /// <summary>Lenta.</summary>
    Slow,
}
