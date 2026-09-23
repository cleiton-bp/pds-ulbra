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
/// <para>No banco vira texto em snake_case (image, video).</para>
/// </summary>
public enum MediaKindEnum
{
    /// <summary>
    /// Print, foto da tela, captura recortada.
    ///
    /// <para>E o tipo que da nome a etapa, e o mais barato de guardar: alguns
    /// megabytes, sem duracao e sem nada para tocar.</para>
    /// </summary>
    Image,

    /// <summary>
    /// Gravacao curta de tela.
    ///
    /// <para><b>E o caro, nos dois sentidos.</b> Custa armazenamento de verdade, e
    /// carrega muito mais dado de terceiro que um print — um print e um instante
    /// escolhido, e sessenta segundos de tela mostram notificacao chegando e aba
    /// aberta ao lado. E por isso que a duracao maxima e a protecao mais barata
    /// que existe aqui: ela corta as duas coisas de uma vez.</para>
    /// </summary>
    Video,
}
