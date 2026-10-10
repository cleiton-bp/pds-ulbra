using System.Text.RegularExpressions;
using Pds.Domain.Entities;

namespace Pds.Service.Cards;

/// <summary>
/// Arruma os textos curtos do card antes de chegarem ao banco: o titulo e os nomes
/// de prioridade e de etiqueta.
///
/// <para>Faz pouco de proposito, como o nome do estado: o texto vai para a tela do
/// jeito que a pessoa escreveu. Tira as bordas, junta os espacos repetidos do meio
/// — que sao invisiveis e fariam dois nomes iguais passarem por diferentes — e
/// transforma quebra de linha em espaco, porque titulo e nome sao uma linha.</para>
/// </summary>
public static partial class CardText
{
    /// <summary>
    /// O titulo numa linha, ou <b>nulo</b> quando veio em branco — quem chama decide
    /// se em branco e erro (o card do time) ou "sem titulo" (o relato).
    /// </summary>
    /// <exception cref="ArgumentException">Comprido demais, depois de arrumado.</exception>
    public static string? Title(string? value)
    {
        var titulo = Whitespace().Replace((value ?? string.Empty).Trim(), " ");

        if (titulo.Length == 0)
            return null;

        // Conferido depois de arrumar: e esse o tamanho que vai para a coluna.
        if (titulo.Length > Report.MaxTitleLength)
            throw new ArgumentException($"O titulo pode ter ate {Report.MaxTitleLength} caracteres.");

        return titulo;
    }

    /// <summary>
    /// Um texto curto numa linha, ou <b>nulo</b> quando veio em branco — sem conferir o
    /// tamanho, que quem chama conhece: a pergunta de um tipo de relato, o texto da caixa
    /// livre.
    /// </summary>
    public static string? Line(string? value)
    {
        var linha = Whitespace().Replace((value ?? string.Empty).Trim(), " ");
        return linha.Length == 0 ? null : linha;
    }

    /// <summary>O nome de uma prioridade ou etiqueta, numa linha e obrigatorio.</summary>
    /// <param name="value">O que veio.</param>
    /// <param name="maxLength">O teto do nome.</param>
    /// <param name="what">Do que e o nome, para a mensagem: "a prioridade", "a etiqueta".</param>
    /// <exception cref="ArgumentException">Em branco, ou comprido demais.</exception>
    public static string Name(string? value, int maxLength, string what)
    {
        var name = Whitespace().Replace((value ?? string.Empty).Trim(), " ");

        if (name.Length == 0)
            throw new ArgumentException($"Escreva um nome para {what}.");

        if (name.Length > maxLength)
            throw new ArgumentException($"O nome d{what} pode ter ate {maxLength} caracteres.");

        return name;
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
