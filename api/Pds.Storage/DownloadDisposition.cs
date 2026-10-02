using System.Globalization;
using System.Text;

namespace Pds.Storage;

/// <summary>
/// O cabecalho que faz o navegador salvar o arquivo com um nome, em vez de abri-lo.
///
/// <para><b>O nome vem de fora — e o que a pessoa deu ao arquivo —, entao ele e
/// limpo aqui.</b> Aspas e quebras de linha no nome escreveriam outro cabecalho na
/// resposta. O nome vai duas vezes: em ASCII, sem acento e sem nada fora de letras,
/// numeros e pontuacao simples, para o navegador antigo; e inteiro, codificado em
/// UTF-8 por cento (RFC 6266), para o resto. Codificado, nenhum caractere do nome
/// consegue sair de dentro do valor.</para>
/// </summary>
public static class DownloadDisposition
{
    /// <summary>Tamanho maximo do nome no cabecalho. Nome maior e cortado, mantendo a extensao.</summary>
    public const int MaxNameLength = 120;

    public static string For(string fileName)
    {
        // Sem controle nem formato (Cc, Cf): a quebra de linha e os caracteres invisiveis
        // de direcao, que fazem "fatura\u202Efdp.txt" aparecer como "faturatxt.pdf" na
        // janela de salvar.
        var visivel = new string((fileName ?? string.Empty)
            .Where(c => !char.IsControl(c) && CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.Format)
            .ToArray()).Trim();
        var nome = Limitar(visivel.Length == 0 ? "anexo" : visivel);
        var ascii = Ascii(nome);

        return $"attachment; filename=\"{ascii}\"; filename*=UTF-8''{Uri.EscapeDataString(nome)}";
    }

    /// <summary>
    /// A versao em ASCII: sem acento, e so letras, numeros, espaco, ponto, hifen e
    /// sublinhado. O resto vira sublinhado.
    /// </summary>
    private static string Ascii(string nome)
    {
        var semAcento = new StringBuilder(nome.Length);

        foreach (var c in nome.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark)
                continue;

            semAcento.Append(char.IsAsciiLetterOrDigit(c) || c is ' ' or '.' or '-' or '_' ? c : '_');
        }

        var limpo = semAcento.ToString().Trim();
        return limpo.Trim('.', '_').Length == 0 ? "anexo" : limpo;
    }

    /// <summary>Corta o nome longo pelo meio do comeco, e nunca a extensao.</summary>
    private static string Limitar(string nome)
    {
        // Sem pasta: o nome pode chegar com o caminho, no Windows.
        nome = nome.Replace('\\', '/');
        nome = nome[(nome.LastIndexOf('/') + 1)..];

        if (nome.Length <= MaxNameLength)
            return nome.Length == 0 ? "anexo" : nome;

        var ponto = nome.LastIndexOf('.');
        var extensao = ponto > 0 && nome.Length - ponto <= 10 ? nome[ponto..] : string.Empty;
        var comeco = nome[..(MaxNameLength - extensao.Length)];

        // Um emoji sao dois caracteres; cortado no meio, a metade que sobra nao e texto.
        if (char.IsHighSurrogate(comeco[^1]))
            comeco = comeco[..^1];

        return comeco + extensao;
    }
}
