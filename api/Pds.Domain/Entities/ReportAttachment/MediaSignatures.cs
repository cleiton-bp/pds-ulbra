using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Os formatos que o sistema aceita, reconhecidos pelos <b>bytes</b>.
///
/// <para><b>Extensao nao e prova, e tipo declarado tambem nao.</b> Os dois sao
/// escolhidos por quem envia. O unico jeito de saber o que um arquivo e, e olhar o
/// comeco dele — todo formato de imagem abre com uma marca fixa, posta ali
/// justamente para ser reconhecida sem depender do nome.</para>
///
/// <para><b>Por que isto existe mesmo com a assinatura do envio.</b> A permissao
/// assinada garante que o objeto seja gravado com o rotulo que pedimos, e nada
/// mais: quem a obtem pode pos bytes de qualquer coisa la dentro, e o objeto
/// continuara dizendo que e uma imagem. Sem esta conferencia, o produto guardaria e
/// serviria o que alguem quisesse, sob um rotulo que nos mesmos escolhemos.</para>
///
/// <para><b>A lista e curta de proposito.</b> Cada formato a mais e uma superficie
/// a mais, e os tres daqui cobrem o print, a foto e a captura recortada.</para>
///
/// <para><b>Sem video, e para envio novo nenhum.</b> Ele saiu do produto por pesar
/// demais no armazenamento e na entrega, e o WebM saiu daqui junto. Os videos que
/// ja estavam confirmados continuam no armazenamento e tocando: esta lista so
/// decide o que entra, e nao o que ja entrou.</para>
/// </summary>
public static class MediaSignatures
{
    /// <summary>
    /// Quantos bytes do comeco bastam para decidir.
    ///
    /// <para>Doze, e nao mais: o formato mais exigente daqui e o WebP, que precisa
    /// do oitavo ao decimo primeiro byte. Pedir mais so gastaria banda em toda
    /// confirmacao.</para>
    /// </summary>
    public const int LeadingBytes = 12;

    /// <summary>
    /// Os tipos aceitos, por categoria. So imagem: categoria fora daqui nao e
    /// assinada nem confirmada.
    /// </summary>
    public static readonly IReadOnlyDictionary<MediaKindEnum, string[]> Accepted =
        new Dictionary<MediaKindEnum, string[]>
        {
            [MediaKindEnum.Image] = ["image/png", "image/jpeg", "image/webp"],
        };

    /// <summary>
    /// Os bytes conferem com o tipo declarado.
    ///
    /// <para><b>Confere contra o tipo, e nao contra a lista inteira.</b> Aceitar um
    /// PNG num objeto que diz ser JPEG faria o painel entregar um arquivo com o
    /// rotulo errado — e o rotulo gravado mentiria sobre o conteudo.</para>
    /// </summary>
    public static bool Matches(string contentType, ReadOnlySpan<byte> leading)
        => contentType switch
        {
            // 89 P N G \r \n 1A \n — a marca do PNG traz \r\n de proposito, para
            // denunciar quem transferiu o arquivo em modo texto e trocou a quebra.
            "image/png" => Starts(leading, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),

            // FF D8 FF — inicio de todo JPEG, seja JFIF ou Exif.
            "image/jpeg" => Starts(leading, [0xFF, 0xD8, 0xFF]),

            // RIFF....WEBP — os quatro bytes do meio sao o tamanho, e variam.
            "image/webp" => Starts(leading, [0x52, 0x49, 0x46, 0x46])
                            && Starts(leading[8..], [0x57, 0x45, 0x42, 0x50]),

            _ => false,
        };

    /// <summary>
    /// O tipo e aceito para esta categoria.
    ///
    /// <para>Conferido antes de assinar, para a recusa chegar antes do envio e nao
    /// depois — quem escolheu um arquivo e esperou o envio terminar para ouvir "nao
    /// serve" esperou a toa.</para>
    /// </summary>
    public static bool IsAccepted(MediaKindEnum kind, string contentType)
        => Accepted.TryGetValue(kind, out var tipos) && tipos.Contains(contentType);

    private static bool Starts(ReadOnlySpan<byte> leading, ReadOnlySpan<byte> marca)
        => leading.Length >= marca.Length && leading[..marca.Length].SequenceEqual(marca);
}
