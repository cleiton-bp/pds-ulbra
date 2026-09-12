namespace Pds.Domain.Enums;

/// <summary>
/// De que canto inferior a ferramenta sai, e para que lado o quadro abre.
///
/// So os dois cantos de baixo: o de cima disputa com cabecalho fixo, menu e aviso
/// de cookie, que e onde todo site ja tem coisa parada.
///
/// No banco vira texto em snake_case (bottom_right, bottom_left).
/// </summary>
public enum WidgetPositionEnum
{
    /// <summary>O canto direito, padrao.</summary>
    BottomRight,

    /// <summary>O canto esquerdo, para quem ja tem algo parado na direita.</summary>
    BottomLeft,
}
