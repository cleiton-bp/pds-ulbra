namespace Pds.Domain.Text;

/// <summary>
/// Os caracteres de controle que nenhum texto do sistema guarda: todos, menos a tabulacao
/// e a quebra de linha.
///
/// <para>O PostgreSQL recusa o byte nulo num texto UTF-8, e um "\u0000" num relato virava
/// erro 500 na gravacao. Os demais nao quebram nada, mas tambem nao servem a ninguem num
/// titulo, numa resposta ou numa busca.</para>
/// </summary>
public static class ControlCharacters
{
    /// <summary>O texto sem os caracteres de controle, menos tabulacao, quebra de linha e retorno.</summary>
    public static string Strip(string texto)
        => Has(texto) ? string.Concat(texto.Where(c => !Unwanted(c))) : texto;

    /// <summary>Se o texto tem algum caractere de controle, fora tabulacao, quebra de linha e retorno.</summary>
    public static bool Has(string texto) => texto.Any(Unwanted);

    private static bool Unwanted(char c) => char.IsControl(c) && c is not ('\t' or '\n' or '\r');
}
