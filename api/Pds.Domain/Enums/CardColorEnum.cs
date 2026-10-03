namespace Pds.Domain.Enums;

/// <summary>
/// As cores de etiqueta e de prioridade: uma paleta fixa, e nao um seletor livre.
///
/// <para><b>Fixa de proposito.</b> Cada cor tem o par certo no tema claro e no
/// escuro, escolhido no painel; um hexadecimal livre ficaria ilegivel num dos dois.
/// E oito bastam para separar o que um time costuma separar.</para>
///
/// No banco vira texto em snake_case (gray, blue, green...).
/// </summary>
public enum CardColorEnum
{
    Gray,

    Blue,

    Green,

    Yellow,

    Orange,

    Red,

    Purple,

    Pink,
}
