using System.Text.RegularExpressions;
using Pds.Domain.Entities;

namespace Pds.Service.PublicStages;

/// <summary>
/// Arruma o texto de uma etapa publica antes de ele chegar ao banco.
///
/// <para>Faz pouco, como o nome do estado interno: este texto vai para a tela do
/// jeito que a pessoa escreveu, e corrigir a escrita dela seria decidir por ela
/// como o proprio processo se explica.</para>
///
/// <para>A diferenca para o estado e que aqui ha <b>duas</b> medidas — o rotulo,
/// que e curto, e a frase, que e uma frase. Tratar as duas com o mesmo teto faria
/// caber um paragrafo no lugar de um rotulo de linha do tempo.</para>
/// </summary>
public static partial class PublicStageText
{
    /// <summary>
    /// O rotulo do passo. Obrigatorio.
    /// </summary>
    /// <exception cref="ArgumentException">Rotulo em branco ou comprido demais.</exception>
    public static string Label(string? value)
    {
        var label = Collapse(value);

        if (label.Length == 0)
            throw new ArgumentException("Escreva um nome para a etapa.");

        if (label.Length > ProjectPublicStage.MaxLabelLength)
            throw new ArgumentException($"O nome da etapa pode ter ate {ProjectPublicStage.MaxLabelLength} caracteres.");

        return label;
    }

    /// <summary>
    /// A frase que explica o passo. Obrigatoria: ver a entidade.
    /// </summary>
    /// <exception cref="ArgumentException">Frase em branco ou comprida demais.</exception>
    public static string Description(string? value)
    {
        var description = Collapse(value);

        if (description.Length == 0)
            throw new ArgumentException("Escreva uma frase explicando esta etapa para quem relatou.");

        if (description.Length > ProjectPublicStage.MaxSentenceLength)
            throw new ArgumentException($"A frase da etapa pode ter ate {ProjectPublicStage.MaxSentenceLength} caracteres.");

        return description;
    }

    /// <summary>
    /// O "o que vem depois". Opcional: em branco vira <c>null</c>.
    ///
    /// <para>Vira nulo em vez de string vazia porque sao a mesma coisa para quem le
    /// a tela, e duas formas de dizer "nao tem" fariam a consulta ter de perguntar
    /// as duas.</para>
    /// </summary>
    /// <exception cref="ArgumentException">Texto comprido demais.</exception>
    public static string? NextStep(string? value)
    {
        var next = Collapse(value);

        if (next.Length == 0)
            return null;

        if (next.Length > ProjectPublicStage.MaxSentenceLength)
            throw new ArgumentException($"O texto do que vem depois pode ter ate {ProjectPublicStage.MaxSentenceLength} caracteres.");

        return next;
    }

    /// <summary>
    /// Tira as bordas e junta os espacos repetidos do meio, como no nome do estado:
    /// o espaco duplo e invisivel na tela e faria dois rotulos iguais passarem pela
    /// conferencia de repetido.
    /// </summary>
    private static string Collapse(string? value)
        => Whitespace().Replace((value ?? string.Empty).Trim(), " ");

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
