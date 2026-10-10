using Pds.Domain.Entities;

namespace Pds.Service.Reports;

/// <summary>
/// O formulario do relato, conferido contra o tipo escolhido: as respostas as
/// perguntas e a caixa livre viram o texto e as respostas que o relato guarda.
///
/// <para><b>As respostas chegam alinhadas as perguntas do tipo no momento do
/// envio</b>, uma para cada, e a pergunta pulada vem em branco. Uma lista de outro
/// tamanho, ou perguntas mostradas diferentes das de agora, e recusada: e o sinal de
/// que elas mudaram depois de a ferramenta abrir, e casar cada resposta com a
/// pergunta errada estragaria o relato sem ninguem ver.</para>
///
/// <para><b>O texto continua sendo o relato inteiro</b> — as respostas que vieram
/// preenchidas e a caixa no fim, separadas por uma linha em branco e sem as
/// perguntas. Ver <see cref="Report.Text"/>.</para>
/// </summary>
public static class ReportForm
{
    /// <summary>Entre uma resposta e a seguinte, no texto montado: um paragrafo.</summary>
    private const string Separador = "\n\n";

    /// <summary>
    /// O texto e as respostas do relato, ou a recusa com a frase que diz o que fazer.
    /// </summary>
    /// <param name="type">O tipo escolhido, ja conferido: do projeto, e ativo.</param>
    /// <param name="shownQuestions">As perguntas que a ferramenta mostrou, quando ela as manda.</param>
    /// <param name="answers">As respostas, na ordem das perguntas.</param>
    /// <param name="textBox">O que veio na caixa livre.</param>
    /// <returns>
    /// O texto montado, e as respostas com as perguntas — <b>nulas</b> quando o tipo nao
    /// tem pergunta nenhuma, porque ai o texto ja e o relato inteiro.
    /// </returns>
    /// <exception cref="ArgumentException">O que veio nao serve para este tipo.</exception>
    public static (string Text, List<ReportAnswer>? Answers) Read(ProjectReportType type, List<string>? shownQuestions, List<string?>? answers, string? textBox)
    {
        var perguntas = type.Questions;

        // **Sem a lista, nenhuma pergunta respondida** — e nao "as perguntas mudaram":
        // quem fala direto com a rota e manda so a caixa merece ouvir o que falta, e nao
        // um pedido para fechar uma ferramenta que nem abriu.
        var respostas = answers ?? perguntas.Select(_ => (string?)null).ToList();

        if (respostas.Count != perguntas.Count
            || (shownQuestions is not null && !shownQuestions.SequenceEqual(perguntas, StringComparer.Ordinal)))
            throw new ArgumentException("As perguntas deste tipo de relato mudaram. Feche e abra a ferramenta de novo.");

        var pares = perguntas
            .Zip(respostas, (pergunta, resposta) => (Pergunta: pergunta, Resposta: (resposta ?? string.Empty).Trim()))
            .ToList();

        if (pares.Any(par => par.Resposta.Length > ProjectReportType.MaxAnswerLength))
            throw new ArgumentException($"Cada resposta pode ter ate {ProjectReportType.MaxAnswerLength} caracteres.");

        var caixa = (textBox ?? string.Empty).Trim();

        // A caixa que o tipo nao mostra nao tem onde aparecer para o time como a pessoa
        // a escreveu — e aceitar em silencio guardaria texto que ninguem pediu.
        if (caixa.Length > 0 && !type.ShowsTextBox)
            throw new ArgumentException("Este tipo de relato nao tem caixa de texto livre.");

        // Sozinha, a caixa e o relato inteiro, com o teto de sempre. Junto de perguntas,
        // e mais uma resposta, com o teto de uma.
        if (perguntas.Count > 0 && caixa.Length > ProjectReportType.MaxAnswerLength)
            throw new ArgumentException($"O texto livre pode ter ate {ProjectReportType.MaxAnswerLength} caracteres quando vem junto das perguntas.");

        if (perguntas.Count == 0 && caixa.Length > Report.MaxTextLength)
            throw new ArgumentException($"O relato pode ter ate {Report.MaxTextLength} caracteres.");

        var preenchidas = pares.Where(par => par.Resposta.Length > 0).ToList();

        if (preenchidas.Count == 0 && caixa.Length == 0)
        {
            throw new ArgumentException(perguntas.Count == 0
                ? "Escreva o relato."
                : type.ShowsTextBox
                    ? "Responda ao menos uma pergunta, ou escreva no texto livre."
                    : "Responda ao menos uma pergunta.");
        }

        var partes = preenchidas.Select(par => par.Resposta).ToList();
        if (caixa.Length > 0)
            partes.Add(caixa);

        var texto = string.Join(Separador, partes);

        // So acontece com tudo no maximo: quatro respostas e a caixa cheias passam do
        // teto do relato pelos separadores. Cortar seria perder o fim do que a pessoa
        // escreveu sem ela saber.
        if (texto.Length > Report.MaxTextLength)
            throw new ArgumentException($"O relato inteiro pode ter ate {Report.MaxTextLength} caracteres. Encurte alguma resposta.");

        if (perguntas.Count == 0)
            return (texto, null);

        var guardadas = preenchidas
            .Select(par => new ReportAnswer(par.Pergunta, par.Resposta))
            .ToList();

        if (caixa.Length > 0)
            guardadas.Add(new ReportAnswer(null, caixa));

        return (texto, guardadas);
    }
}
