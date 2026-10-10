namespace Pds.Domain.Enums;

/// <summary>
/// O tamanho do botao parado no site do cliente.
///
/// <para>Tres tamanhos, e nao um numero livre: o botao precisa caber no canto de um
/// telefone e continuar facil de tocar. O medio e o de hoje; o pequeno ainda tem a
/// altura minima de toque, e o grande e para o site que quer o botao bem a vista.</para>
///
/// No banco vira texto em snake_case (small, medium, large).
/// </summary>
public enum WidgetLauncherSizeEnum
{
    /// <summary>Discreto, para nao competir com o site.</summary>
    Small,

    /// <summary>O de hoje. Padrao.</summary>
    Medium,

    /// <summary>Bem a vista.</summary>
    Large,
}
