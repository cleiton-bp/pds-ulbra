namespace Pds.Domain.Enums;

/// <summary>
/// O que a pessoa esta relatando. Lista fixa por enquanto; escolher os proprios
/// tipos e as proprias palavras e configuracao que chega mais adiante, e por isso
/// o formulario desta fase mostra os tres sem deixar mexer.
///
/// No banco vira texto em snake_case (bug, improvement, question).
/// </summary>
public enum ReportTypeEnum
{
    /// <summary>Algo que deveria funcionar e nao funciona.</summary>
    Bug,

    /// <summary>Funciona, mas poderia ser melhor.</summary>
    Improvement,

    /// <summary>Duvida sobre como usar. Nao e defeito, e costuma ser o mais comum.</summary>
    Question,
}
