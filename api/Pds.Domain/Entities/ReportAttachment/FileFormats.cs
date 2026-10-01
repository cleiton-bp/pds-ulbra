namespace Pds.Domain.Entities;

/// <summary>Como os bytes de um formato de arquivo sao conferidos.</summary>
public enum FileCheck
{
    /// <summary><c>%PDF-</c> no comeco — ver <see cref="FileFormats"/>.</summary>
    Pdf,

    /// <summary>Texto: nenhum byte zero, quase nenhum caractere de controle.</summary>
    Text,

    /// <summary>A marca do zip, que tambem e a do xlsx e do docx.</summary>
    Zip,

    /// <summary>A marca do zip e o tipo que o proprio arquivo declara dentro dele (ODF).</summary>
    OpenDocument,
}

/// <summary>Uma extensao de um formato: o tipo que ela grava, e como os bytes sao conferidos.</summary>
/// <param name="Extension">A extensao, com o ponto e em minusculas.</param>
/// <param name="ContentType">O tipo gravado e assinado — sempre este, e nunca o que o navegador disse.</param>
/// <param name="Check">A conferencia dos bytes.</param>
public sealed record FileFormatType(string Extension, string ContentType, FileCheck Check);

/// <summary>Um formato que o dono marca na tela de Midia, com as extensoes dele.</summary>
/// <param name="Key">O nome do formato no contrato e no banco.</param>
/// <param name="IsDefault">Marcado de fabrica quando o dono liga a categoria.</param>
/// <param name="Types">As extensoes do formato.</param>
public sealed record FileFormat(string Key, bool IsDefault, IReadOnlyList<FileFormatType> Types);

/// <summary>
/// O catalogo dos arquivos que nao sao imagem — os unicos que a categoria "arquivo"
/// aceita, e so os que o dono marcar.
///
/// <para><b>Catalogo fechado, e nao "qualquer extensao".</b> Arquivo de fora e o anexo
/// com mais risco, e cada formato aqui foi escolhido por ser o que um relato de
/// defeito traz — o PDF da fatura, o log, a planilha que nao fecha — e por ter como
/// conferir os bytes. Executavel, pagina HTML, SVG e planilha com macro ficam fora:
/// nao ha relato que precise deles, e ha ataque que precisa.</para>
///
/// <para><b>O tipo gravado sai daqui, e nao do navegador.</b> O navegador deduz pela
/// extensao e erra de lugar para lugar — o <c>.log</c> chega sem tipo, o <c>.csv</c>
/// chega como planilha do Excel no Windows. O quadro manda o tipo deste catalogo, e o
/// pedido e recusado quando extensao e tipo nao casam.</para>
///
/// <para><b>Os bytes sao conferidos onde o formato permite</b>, como na imagem: a
/// assinatura do envio garante o rotulo, e nunca o conteudo. Um executavel renomeado
/// para <c>.log</c> tem byte zero logo no comeco, e e recusado. O xlsx e o docx so
/// tem a marca do zip no comeco; o que ha dentro deles nao da para conferir sem
/// abrir o arquivo — e por isso a leitura e sempre download, e nunca na pagina.</para>
/// </summary>
public static class FileFormats
{
    /// <summary>
    /// O teto de cada arquivo no sistema, acima de qualquer projeto: 25 MB. Um log de
    /// dia inteiro ou uma planilha grande cabem; um despejo de banco, nao.
    /// </summary>
    public const long MaxBytesCeiling = 25L * 1024 * 1024;

    /// <summary>
    /// Quantos bytes do comeco a conferencia usa. <b>O texto precisa de uma amostra</b>
    /// — um byte zero no meio do primeiro quilobyte denuncia binario —, e o PDF pode
    /// trazer lixo antes da marca, que os leitores aceitam no primeiro quilobyte.
    /// </summary>
    public const int LeadingBytes = 1024;

    public static readonly IReadOnlyList<FileFormat> All =
    [
        new("pdf", IsDefault: true, [new(".pdf", "application/pdf", FileCheck.Pdf)]),
        new("text", IsDefault: true,
        [
            new(".txt", "text/plain", FileCheck.Text),
            new(".log", "text/plain", FileCheck.Text),
        ]),
        new("spreadsheet", IsDefault: true,
        [
            new(".csv", "text/csv", FileCheck.Text),
            new(".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", FileCheck.Zip),
            new(".ods", "application/vnd.oasis.opendocument.spreadsheet", FileCheck.OpenDocument),
        ]),
        new("document", IsDefault: false,
        [
            new(".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", FileCheck.Zip),
            new(".odt", "application/vnd.oasis.opendocument.text", FileCheck.OpenDocument),
        ]),
        new("json", IsDefault: false, [new(".json", "application/json", FileCheck.Text)]),
        new("zip", IsDefault: true, [new(".zip", "application/zip", FileCheck.Zip)]),
    ];

    /// <summary>Os formatos marcados de fabrica.</summary>
    public static IReadOnlyList<string> DefaultKeys { get; } =
        All.Where(formato => formato.IsDefault).Select(formato => formato.Key).ToList();

    /// <summary>O formato pelo nome, ou nulo.</summary>
    public static FileFormat? Find(string key)
        => All.FirstOrDefault(formato => formato.Key == key);

    /// <summary>
    /// A extensao do arquivo, entre os formatos marcados, com o tipo declarado — ou nulo
    /// quando o projeto nao aceita, ou quando extensao e tipo nao casam.
    /// </summary>
    public static FileFormatType? Accepted(
        IEnumerable<string> enabledKeys,
        string? fileName,
        string contentType)
    {
        var extensao = ExtensionOf(fileName);

        if (extensao is null)
            return null;

        return enabledKeys
            .Select(Find)
            .OfType<FileFormat>()
            .SelectMany(formato => formato.Types)
            .FirstOrDefault(tipo => tipo.Extension == extensao && tipo.ContentType == contentType);
    }

    /// <summary>O tipo e de algum formato do catalogo.</summary>
    public static bool IsKnownContentType(string contentType)
        => All.Any(formato => formato.Types.Any(tipo => tipo.ContentType == contentType));

    /// <summary>
    /// A extensao, com o ponto e em minusculas, ou nulo. So o que vem depois do ultimo
    /// ponto do ultimo trecho do caminho — o nome pode trazer pasta, no Windows.
    /// </summary>
    public static string? ExtensionOf(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return null;

        var nome = fileName.Trim().Replace('\\', '/');
        nome = nome[(nome.LastIndexOf('/') + 1)..];
        var ponto = nome.LastIndexOf('.');

        return ponto <= 0 || ponto == nome.Length - 1 ? null : nome[ponto..].ToLowerInvariant();
    }

    /// <summary>
    /// Os bytes do comeco sao do formato que o tipo diz. Tipo fora do catalogo nao casa.
    /// </summary>
    public static bool Matches(string contentType, ReadOnlySpan<byte> leading)
    {
        var tipo = All.SelectMany(formato => formato.Types)
            .FirstOrDefault(tipo => tipo.ContentType == contentType);

        return tipo?.Check switch
        {
            FileCheck.Pdf => Contains(leading, "%PDF-"u8),
            FileCheck.Text => IsText(leading),
            FileCheck.Zip => IsZip(leading),
            // O ODF guarda o proprio tipo no primeiro item do zip, sem compressao: um
            // xlsx renomeado para .ods tem a marca do zip, e nao tem este texto.
            FileCheck.OpenDocument => IsZip(leading) && Contains(leading, System.Text.Encoding.ASCII.GetBytes(contentType)),
            _ => false,
        };
    }

    /// <summary>
    /// Texto: nenhum byte zero, e no maximo 2% de caracteres de controle alem de tab,
    /// quebras, avanco de pagina e ESC (as cores dos logs de terminal).
    ///
    /// <para><b>Nao exige UTF-8.</b> O CSV que o Excel exporta no Brasil sai em
    /// Windows-1252, com o "e" acentuado num byte so; exigir UTF-8 recusaria a planilha
    /// mais comum.</para>
    ///
    /// <para><b>Com marca de UTF-16, a regra vale por caractere</b>, e nao por byte: os
    /// zeros de cada par sao do proprio texto, mas um caractere zero nao e. Sem isto, a
    /// marca na frente de qualquer binario o faria passar por texto.</para>
    /// </summary>
    private static bool IsText(ReadOnlySpan<byte> leading)
    {
        if (leading.Length == 0)
            return false;

        var littleEndian = Starts(leading, [0xFF, 0xFE]);

        if (littleEndian || Starts(leading, [0xFE, 0xFF]))
        {
            var corpo = leading[2..];

            // Par de bytes por caractere: sobra de um byte nao e UTF-16.
            if (corpo.Length % 2 != 0)
                return false;

            var unidades = corpo.Length / 2;
            var controlesUtf16 = 0;

            for (var i = 0; i < unidades; i++)
            {
                var unidade = littleEndian
                    ? corpo[2 * i] | (corpo[(2 * i) + 1] << 8)
                    : (corpo[2 * i] << 8) | corpo[(2 * i) + 1];

                if (unidade == 0)
                    return false;

                if (EhControle(unidade))
                    controlesUtf16++;
            }

            return controlesUtf16 * 50 <= Math.Max(unidades, 1);
        }

        var controles = 0;

        foreach (var b in leading)
        {
            if (b == 0)
                return false;

            if (EhControle(b))
                controles++;
        }

        return controles * 50 <= leading.Length;
    }

    /// <summary>Caractere de controle que texto nao tem: tudo abaixo do espaco, menos tab, quebras, avanco de pagina e ESC.</summary>
    private static bool EhControle(int caractere)
        => caractere < 0x20 && caractere is not (0x09 or 0x0A or 0x0C or 0x0D or 0x1B);

    /// <summary>
    /// PK 03 04 (o primeiro item), PK 05 06 (o zip vazio) ou PK 07 08 (o zip em partes).
    /// </summary>
    private static bool IsZip(ReadOnlySpan<byte> leading)
        => Starts(leading, [0x50, 0x4B, 0x03, 0x04])
           || Starts(leading, [0x50, 0x4B, 0x05, 0x06])
           || Starts(leading, [0x50, 0x4B, 0x07, 0x08]);

    private static bool Starts(ReadOnlySpan<byte> leading, ReadOnlySpan<byte> marca)
        => leading.Length >= marca.Length && leading[..marca.Length].SequenceEqual(marca);

    private static bool Contains(ReadOnlySpan<byte> leading, ReadOnlySpan<byte> trecho)
        => leading.IndexOf(trecho) >= 0;
}
