namespace Pds.Domain.Filters;

/// <summary>
/// Como a busca compara texto: <b>sem diferenciar maiuscula nem acento</b> — "nao"
/// acha "Não", e "pagamento" acha "Pagamento".
///
/// <para>A mesma tabela de letras vale dos dois lados: no banco, pela funcao
/// <c>translate</c> do Postgres, e aqui, no termo digitado. Uma tabela so, e nao a
/// decomposicao do Unicode de um lado e outra coisa do outro: a letra que um lado
/// tirasse e o outro nao faria a busca deixar de achar sem aviso.</para>
/// </summary>
public static class SearchText
{
    /// <summary>As letras com acento que a busca ignora, na ordem de <see cref="Plain"/>.</summary>
    public const string Accented = "áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ";

    /// <summary>A letra sem acento de cada uma de <see cref="Accented"/>, na mesma posicao.</summary>
    public const string Plain = "aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY";

    /// <summary>O texto como a busca o compara: sem acento e em minusculas.</summary>
    public static string Fold(string value)
    {
        var letras = value.ToCharArray();
        for (var i = 0; i < letras.Length; i++)
        {
            var onde = Accented.IndexOf(letras[i]);
            if (onde >= 0)
                letras[i] = Plain[onde];
        }

        return new string(letras).ToLowerInvariant();
    }
}
