namespace Pds.Domain.Enums;

/// <summary>
/// Que tipo de arquivo e este.
///
/// <para><b>A lista cresce com o produto, e por isso ela e dado e nao estrutura.</b>
/// Os limites de cada tipo moram numa linha da tabela de limites, uma por tipo —
/// acrescentar audio um dia e acrescentar um valor aqui e uma linha la, sem
/// migracao e sem coluna nova em lugar nenhum. O desenho com uma coluna por tipo
/// custaria uma migracao por tipo, e deixaria toda configuracao carregando campos
/// de tipos que aquele projeto nunca ligou.</para>
///
/// <para>No banco vira texto em snake_case (image, video). Hoje so imagem entra;
/// ver <see cref="Video"/>.</para>
/// </summary>
public enum MediaKindEnum
{
    /// <summary>
    /// Print, foto da tela, captura recortada.
    ///
    /// <para>E o unico tipo que entra, e o mais barato de guardar: alguns
    /// megabytes, sem duracao e sem nada para tocar.</para>
    /// </summary>
    Image,

    /// <summary>
    /// Gravacao curta de tela. <b>Nao entra mais.</b>
    ///
    /// <para><b>Saiu do produto porque pesava demais</b> no armazenamento e na
    /// entrega: cada video pesava varias vezes o teto de uma imagem, e pesava de
    /// novo a cada vez que alguem apertava play. Nenhum projeto configura, nenhuma
    /// permissao de envio e assinada para ele, e o padrao de fabrica nem o
    /// conhece.</para>
    ///
    /// <para><b>O valor fica, e nao e esquecimento.</b> Ha anexo confirmado e linha
    /// de limite gravados como <c>video</c>, e sem o valor eles deixariam de
    /// carregar. Os videos que ja estavam guardados continuam listados e
    /// tocando.</para>
    /// </summary>
    Video,
}
