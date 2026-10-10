namespace Pds.Domain.Enums;

/// <summary>
/// De que canto a ferramenta sai, e para que lado o quadro abre.
///
/// <para><b>Os quatro cantos, e o padrao continua embaixo a direita.</b> Os de cima
/// disputam com cabecalho fixo, menu e aviso de cookie, que e onde todo site ja tem
/// coisa parada — por isso nunca sao o padrao. Mas e o cliente quem conhece o proprio
/// site: num painel com o chat de atendimento embaixo, o canto de cima e o unico
/// livre.</para>
///
/// <para>Os dois novos entram no fim de proposito: o banco guarda o nome, e nao o
/// numero, mas quem ainda le pelo numero continua lendo os dois antigos certo.</para>
///
/// No banco vira texto em snake_case (bottom_right, bottom_left, top_right, top_left).
/// </summary>
public enum WidgetPositionEnum
{
    /// <summary>O canto direito de baixo, padrao.</summary>
    BottomRight,

    /// <summary>O canto esquerdo de baixo, para quem ja tem algo parado na direita.</summary>
    BottomLeft,

    /// <summary>O canto direito de cima. O quadro abre para baixo.</summary>
    TopRight,

    /// <summary>O canto esquerdo de cima. O quadro abre para baixo.</summary>
    TopLeft,
}
