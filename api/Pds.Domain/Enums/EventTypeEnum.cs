namespace Pds.Domain.Enums;

/// <summary>
/// O que aconteceu. A lista cresce conforme o produto anda, e e por isso que o
/// resto do evento vive num campo livre: tipo novo entra sem migracao.
///
/// No banco vira texto em snake_case (report_created, report_viewed).
/// </summary>
public enum EventTypeEnum
{
    /// <summary>Um relato entrou.</summary>
    ReportCreated,

    /// <summary>Alguem abriu o acompanhamento de um relato.</summary>
    ReportViewed,

    /// <summary>
    /// O time moveu o relato de coluna.
    ///
    /// <para><b>E este evento que e a verdade</b>, e nao a coluna gravada no
    /// relato: aquela e cache, e existe para a lista nao precisar reconstruir o
    /// caminho de cada relato a cada abertura da tela. O payload guarda de onde e
    /// para onde, com os nomes que valiam na epoca.</para>
    /// </summary>
    ReportStateChanged,

    /// <summary>
    /// Alguem do time escreveu um comentario interno.
    ///
    /// <para><b>O texto nao vem junto.</b> O evento registra que houve comentario,
    /// e nao o que foi dito: evento so cresce e nunca e apagado, e copiar o texto
    /// para ca criaria uma segunda copia do dado mais perigoso da aplicacao numa
    /// tabela que nao se consegue limpar.</para>
    /// </summary>
    ReportInternalCommented,

    /// <summary>
    /// Alguem do time escreveu um comentario para quem relatou.
    ///
    /// <para>E tipo proprio, e nao o mesmo tipo com a visibilidade no payload: um
    /// campo no payload seria o sinalizador que as duas tabelas existem para
    /// evitar, de volta pela porta dos fundos.</para>
    /// </summary>
    ReportPublicCommented,
}
