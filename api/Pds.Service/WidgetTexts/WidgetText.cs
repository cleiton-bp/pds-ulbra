using System.Text.RegularExpressions;

namespace Pds.Service.WidgetTexts;

/// <summary>
/// Confere os textos da ferramenta antes de chegarem ao banco: quais aceitam
/// variaveis, e se as variaveis escritas existem.
///
/// <para><b>Variavel so depois de enviar.</b> E na confirmacao e no topo do
/// acompanhamento que existem o nome, o protocolo, o tipo e a etapa; antes disso a
/// pessoa ainda nao disse nada, e uma variavel no botao ou numa pergunta nunca teria
/// valor. Recusar na gravacao e melhor do que deixar o texto aparecer com um buraco no
/// site do cliente.</para>
///
/// <para><b>A troca nao acontece aqui.</b> Quem troca e a tela que mostra o texto
/// — o quadro e a pagina de acompanhamento —, porque e ela que tem os valores, e ela
/// mostra o resultado como texto puro. Aqui so se decide o que pode ser gravado.</para>
///
/// <para>A forma e <c>{{nome}}</c>, ou <c>{{nome|padrao}}</c> com o que entra quando a
/// variavel nao tem valor — o primeiro nome de quem nao disse o nome, por
/// exemplo.</para>
/// </summary>
public static partial class WidgetText
{
    public const string FirstName = "primeiroNome";
    public const string TrackingCode = "protocolo";
    public const string Type = "tipo";
    public const string Project = "projeto";
    public const string Stage = "etapa";

    /// <summary>As variaveis da confirmacao: tudo o que existe logo depois de enviar.</summary>
    public static readonly IReadOnlyList<string> AfterSending = [FirstName, TrackingCode, Type, Project];

    /// <summary>
    /// As do acompanhamento: as mesmas, e a etapa — que na confirmacao ainda nao
    /// existe, porque o relato acabou de chegar.
    /// </summary>
    public static readonly IReadOnlyList<string> OnTracking = [FirstName, TrackingCode, Type, Project, Stage];

    /// <summary>
    /// Um texto que nao aceita variavel. Qualquer <c>{{</c> ou <c>}}</c> e recusado:
    /// apareceria do jeito que foi escrito, chaves inclusive.
    /// </summary>
    /// <param name="text">O texto, ja arrumado e conferido no tamanho.</param>
    /// <param name="what">Do que e o texto, para a mensagem: "o texto do botao".</param>
    /// <exception cref="ArgumentException">Com variavel.</exception>
    public static string WithoutVariables(string text, string what)
    {
        if (text.Contains("{{") || text.Contains("}}"))
            throw new ArgumentException(
                $"O campo com {what} nao aceita variaveis. Elas so funcionam na mensagem de confirmacao e no texto do acompanhamento.");

        return text;
    }

    /// <summary>
    /// Um texto com variaveis: cada uma tem de existir e estar na lista do lugar onde o
    /// texto aparece, e toda chave aberta tem de fechar.
    /// </summary>
    /// <param name="text">O texto, ja arrumado e conferido no tamanho.</param>
    /// <param name="what">Do que e o texto, para a mensagem.</param>
    /// <param name="allowed"><see cref="AfterSending"/> ou <see cref="OnTracking"/>.</param>
    /// <exception cref="ArgumentException">Variavel desconhecida, fora do lugar, ou sem fechar.</exception>
    public static string WithVariables(string text, string what, IReadOnlyList<string> allowed)
    {
        foreach (Match match in Variable().Matches(text))
        {
            var nome = match.Groups["name"].Value;

            if (allowed.Contains(nome))
                continue;

            // A etapa existe, so nao aqui: dizer "nao existe" mandaria a pessoa procurar
            // um erro de digitacao que ela nao cometeu.
            if (nome == Stage)
                throw new ArgumentException(
                    "A variavel {{etapa}} so funciona no texto do acompanhamento: na confirmacao o relato acabou de chegar.");

            throw new ArgumentException(
                $"A variavel {{{{{nome}}}}} nao existe. Use {string.Join(", ", allowed.Select(name => $"{{{{{name}}}}}"))}.");
        }

        // O que sobra depois de tirar as variaveis bem escritas e chave sem par: a
        // pessoa esqueceu de fechar, ou abriu com uma chave so.
        var resto = Variable().Replace(text, string.Empty);

        if (resto.Contains("{{") || resto.Contains("}}"))
            throw new ArgumentException(
                $"Uma variavel ficou sem fechar no campo com {what}. Escreva assim: {{{{primeiroNome}}}} ou {{{{primeiroNome|pessoa}}}}.");

        return text;
    }

    /// <summary>
    /// O texto usa esta variavel. E o que decide se o nome do projeto sai para fora: ele
    /// e interno, e so viaja quando o proprio projeto o escreveu.
    /// </summary>
    public static bool Uses(string text, string name)
        => Variable().Matches(text).Any(match => match.Groups["name"].Value == name);

    /// <summary>
    /// <c>{{nome}}</c> ou <c>{{nome|padrao}}</c>, com espacos tolerados em volta do nome.
    /// O padrao nao leva chave, para nao confundir com o fim. A mesma forma esta em
    /// <c>web/src/shared/lib/widgetText.ts</c>, que faz a troca.
    /// </summary>
    [GeneratedRegex(@"\{\{\s*(?<name>[^{}|]*?)\s*(?:\|(?<fallback>[^{}]*))?\}\}")]
    private static partial Regex Variable();
}
