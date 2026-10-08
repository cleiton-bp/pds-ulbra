using System.Text.RegularExpressions;

namespace Pds.Service.Cards;

/// <summary>
/// As mencoes de um comentario interno. O painel escreve <c>@[Nome](identificador)</c>
/// quando a pessoa escolhe alguem do time na lista do "@": o nome e o que foi escrito,
/// e o identificador e quem e — o nome muda, a pessoa nao.
/// </summary>
public static partial class Mentions
{
    /// <summary>As pessoas mencionadas, pelo identificador publico, sem repetir, na ordem em que aparecem.</summary>
    public static IReadOnlyList<Guid> Read(string body)
        => Marca().Matches(body)
            .Select(achado => Guid.Parse(achado.Groups[2].Value))
            .Distinct()
            .ToList();

    /// <summary>
    /// O texto como a pessoa le: cada marca vira "@Nome", e os espacos e as quebras de
    /// linha viram um espaco so. E o trecho que o aviso da mencao mostra no sino.
    /// </summary>
    public static string ToPlainText(string body)
        => Espacos().Replace(Marca().Replace(body, achado => $"@{achado.Groups[1].Value}"), " ").Trim();

    [GeneratedRegex(@"@\[([^\[\]\r\n]{1,180})\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)")]
    private static partial Regex Marca();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Espacos();
}
