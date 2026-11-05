namespace Pds.Domain.Enums;

/// <summary>
/// Como o formulario aparece quando alguem clica no botao, e como sai ao fechar (o mesmo
/// caminho, ao contrario).
///
/// <para>Surgir de uma vez assusta: o quadro cobre parte da pagina do cliente sem aviso.
/// Um movimento curto diz de onde ele veio. Quem visita com o movimento reduzido ligado
/// no sistema ve so o esmaecer, qualquer que seja a escolha.</para>
///
/// No banco vira texto em snake_case (smooth, slide, grow, none).
/// </summary>
public enum WidgetOpenAnimationEnum
{
    /// <summary>Esmaece e sobe um pouco, ate o lugar. Padrao.</summary>
    Smooth,

    /// <summary>Entra deslizando da borda do canto do botao.</summary>
    Slide,

    /// <summary>Nasce do canto do botao, crescendo ate o tamanho do formulario.</summary>
    Grow,

    /// <summary>Aparece de uma vez, sem movimento.</summary>
    None,
}
