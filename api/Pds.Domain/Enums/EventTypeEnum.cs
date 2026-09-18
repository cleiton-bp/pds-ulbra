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

    /// <summary>
    /// A etapa publica do relato mudou: e o que a pessoa de fora ve acontecer.
    ///
    /// <para><b>E um evento proprio, e nao um campo no evento interno.</b> Um
    /// movimento de dentro nem sempre move a jornada, e a jornada as vezes anda
    /// sozinha — sao duas linhas do tempo com ritmos diferentes, e junta-las num
    /// registro so faria a pesquisa ter de adivinhar qual delas cada linha
    /// conta.</para>
    ///
    /// <para>O payload guarda de onde, para onde, os rotulos que valiam na epoca e
    /// a <b>versao do mapa</b> que decidiu — sem ela, recontar o passado usaria o
    /// mapa de hoje e devolveria outra historia.</para>
    /// </summary>
    ReportPublicStageChanged,

    /// <summary>
    /// O relato foi para um estado que nao esta no mapa, e a jornada ficou parada.
    ///
    /// <para>Gravado <b>porque</b> nada aconteceu do lado de fora: e o registro de
    /// uma configuracao faltando, e e por ele que se sabe quanto tempo um relato
    /// passou invisivel para quem o escreveu. Sem o evento, esse silencio nao
    /// deixaria rastro nenhum.</para>
    /// </summary>
    ReportPublicStageUnmapped,
}
