namespace Pds.Domain.Enums;

/// <summary>
/// Em que tamanho a imagem aparece no relato, logo abaixo do texto.
///
/// <para><b>E uma fracao da largura do texto, e nao um numero de pixels.</b> Quem
/// relata monta o relato no quadro, que e estreito; o time le no painel, e a pessoa
/// acompanha numa pagina mais larga. Com a fracao, a imagem que ocupava metade da
/// linha no quadro ocupa metade da linha em todo lugar — e duas assim continuam lado
/// a lado.</para>
///
/// <para><b>Escolha de quem relata, e nao do time.</b> Fica gravada com o anexo e nao
/// muda depois do envio: o relato mostra o que a pessoa montou, do jeito que
/// montou.</para>
///
/// <para>No banco vira texto em snake_case (small, medium, large, full).</para>
/// </summary>
public enum AttachmentDisplaySizeEnum
{
    /// <summary>Um terco da linha: tres cabem lado a lado.</summary>
    Small,

    /// <summary>Meia linha: duas cabem lado a lado.</summary>
    Medium,

    /// <summary>Tres quartos da linha.</summary>
    Large,

    /// <summary>
    /// A linha inteira. <b>E o padrao</b>: o print legivel sem precisar abrir, e
    /// diminuir e escolha de quem relata.
    /// </summary>
    Full,
}
