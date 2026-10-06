namespace Pds.Data.Context;

/// <summary>
/// Funcoes de texto do Postgres que as consultas usam e o EF nao traduz sozinho.
/// Registradas no modelo em <see cref="DataContext"/>; fora de uma consulta, nao
/// rodam.
/// </summary>
public static class SqlText
{
    /// <summary>
    /// A <c>translate</c> do Postgres: troca cada letra de <paramref name="from"/> pela
    /// da mesma posicao em <paramref name="to"/>. E o que tira o acento na busca, sem
    /// extensao no banco (ver <c>SearchText</c>).
    /// </summary>
    public static string? Translate(string? value, string from, string to)
        => throw new NotSupportedException("SqlText.Translate so existe dentro de uma consulta ao banco.");
}
