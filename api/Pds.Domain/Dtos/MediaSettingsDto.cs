using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// Os limites de um tipo de midia, como a tela os manda.
/// </summary>
public class MediaKindLimitDto
{
    /// <summary>Que tipo esta linha configura: <c>Image</c> ou <c>Video</c>.</summary>
    /// <example>Image</example>
    public MediaKindEnum? Kind { get; set; }

    /// <summary>Este tipo e aceito.</summary>
    /// <example>true</example>
    public bool? IsEnabled { get; set; }

    /// <summary>Quantos arquivos deste tipo cabem num relato.</summary>
    /// <example>3</example>
    public int? MaxCount { get; set; }

    /// <summary>Teto de tamanho de cada arquivo, em bytes.</summary>
    /// <example>5242880</example>
    public long? MaxBytes { get; set; }

    /// <summary>Duracao maxima em segundos. Obrigatoria para video, ignorada no resto.</summary>
    /// <example>60</example>
    public int? MaxDurationSeconds { get; set; }
}

/// <summary>
/// A configuracao de midia, como a tela a manda.
///
/// <para><b>Vai inteira, e nao em pedacos</b>, pelo mesmo motivo das outras
/// configuracoes: salvar campo a campo faria duas abas abertas gravarem metades
/// diferentes da mesma configuracao sem ninguem notar. Os tipos vao junto porque o
/// limite total e o limite de cada um so fazem sentido lidos juntos.</para>
///
/// <para><b>Anulavel aqui, e obrigatorio de verdade.</b> Anulavel e o que permite
/// responder "informe o limite" em vez de gravar um numero que ninguem escolheu — e
/// numero de limite gravado por omissao e conta que alguem paga sem ter decidido.</para>
/// </summary>
public class MediaSettingsDto
{
    /// <summary>O quadro mostra anexo. Sem armazenamento configurado, ligar e recusado.</summary>
    /// <example>true</example>
    public bool? IsEnabled { get; set; }

    /// <summary>O botao de capturar a tela aparece.</summary>
    /// <example>true</example>
    public bool? AllowsScreenCapture { get; set; }

    /// <summary>Da para anexar respondendo a um pedido de informacao do time.</summary>
    /// <example>true</example>
    public bool? AllowsOnInfoRequest { get; set; }

    /// <summary>Quantos arquivos cabem num relato, somando todos os tipos.</summary>
    /// <example>4</example>
    public int? MaxFilesPerReport { get; set; }

    /// <summary>Os limites de cada tipo, um por tipo, sem repetir.</summary>
    public List<MediaKindLimitDto>? Kinds { get; set; }
}
