namespace Pds.Domain.Enums;

/// <summary>
/// O arredondamento do botao parado no site do cliente — para combinar com os botoes
/// do proprio site, que e o que faz a ferramenta parecer dele.
///
/// <para>Com so o icone, a pilula vira circulo; os outros dois continuam com os
/// mesmos cantos.</para>
///
/// No banco vira texto em snake_case (pill, rounded, square).
/// </summary>
public enum WidgetLauncherShapeEnum
{
    /// <summary>Cantos todo redondos. O de hoje, padrao.</summary>
    Pill,

    /// <summary>Cantos levemente arredondados.</summary>
    Rounded,

    /// <summary>Cantos retos.</summary>
    Square,
}
