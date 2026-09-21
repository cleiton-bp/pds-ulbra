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

    /// <summary>
    /// O time encerrou o relato, dizendo por que.
    ///
    /// <para><b>O motivo nao vem junto</b>, pela mesma razao que o texto do
    /// comentario nao vem: evento so cresce e nunca e apagado, e copiar para ca um
    /// texto que quem relatou vai ler criaria uma segunda copia dele numa tabela
    /// que nao se consegue limpar. O evento guarda o <b>desfecho</b>, que e o que a
    /// contagem precisa; o resto mora no fechamento.</para>
    ///
    /// <para><b>E separado de <see cref="ReportPublicStageChanged"/> de proposito.</b>
    /// Cair na ultima coluna move a jornada e encerra o relato no mesmo instante, e
    /// sao duas coisas diferentes: a primeira acontece sem a segunda quando o
    /// projeto encerra por botao, e a segunda acontece sem a primeira quando o
    /// estado nao esta mapeado. Um evento so faria a pesquisa ter de adivinhar qual
    /// dos dois cada linha conta.</para>
    /// </summary>
    ReportClosed,

    /// <summary>
    /// Quem relatou disse que resolveu.
    ///
    /// <para><b>E o evento que da sentido a etapa inteira.</b> "Concluido" e o time
    /// dizendo que acabou; este e a pessoa do outro lado dizendo que chegou. Sem o
    /// segundo, o produto vira o que o proprio README denuncia — um sistema que
    /// avisa que fechou o chamado.</para>
    ///
    /// <para>A nota vai no payload porque e um numero, e numero em tabela que so
    /// cresce e exatamente o que a contagem quer ler. <b>A recusa vai junto e
    /// separada</b>: "prefiro nao responder" nao e nota zero, e juntar os dois daria
    /// uma media que parece precisa e nao e.</para>
    /// </summary>
    ReportConfirmed,

    /// <summary>
    /// Quem relatou disse que nao resolveu, e o relato voltou para a fila.
    ///
    /// <para><b>Nao e regressao, e e por isso que existe separado de
    /// <see cref="ReportPublicStageChanged"/>.</b> A jornada anda para tras aqui
    /// porque a pessoa pediu, e nao porque o time se atrapalhou internamente — sao
    /// dois fatos diferentes, e junta-los faria a pesquisa contar como vaivem do
    /// time o que foi resposta de quem esperava.</para>
    ///
    /// <para>O comentario <b>nao</b> vem junto, pela mesma razao que o texto do
    /// comentario nao vem: e texto escrito por uma pessoa, e esta tabela nao se
    /// consegue limpar. Ele mora no fechamento reaberto.</para>
    /// </summary>
    ReportReopened,

    /// <summary>
    /// O time devolveu o relato pedindo informacao, em vez de encerrar.
    ///
    /// <para><b>E o evento que separa dois fatos que chegavam iguais.</b> "Nao
    /// reproduzi" e "nao vamos fazer" sao decisoes opostas, e sem tipo proprio a
    /// contagem nao teria como distinguir o relato que parou esperando resposta do
    /// que foi recusado — que e metade da pergunta sobre relato morrer por
    /// ruido.</para>
    ///
    /// <para>O texto do pedido <b>nao</b> vem junto: ele e um comentario publico, e
    /// esta tabela nao se consegue limpar. Vai o prazo, que e o que a contagem
    /// quer.</para>
    /// </summary>
    ReportInfoRequested,

    /// <summary>
    /// Quem relatou respondeu ao pedido de informacao.
    ///
    /// <para><b>E separado de <see cref="ReportPublicCommented"/> de proposito</b>,
    /// ainda que os dois gravem na mesma tabela de comentarios. A origem ja diria
    /// quem escreveu, mas o historico do painel le o <b>tipo</b> — e "comentario
    /// para quem relatou" sobre uma resposta de quem relatou e uma linha que diz o
    /// contrario do que aconteceu.</para>
    /// </summary>
    ReportReplied,

    /// <summary>
    /// Um encerramento deixou de valer porque o relato saiu da coluna que encerra.
    ///
    /// <para><b>Nao e reabertura.</b> Reabrir e a pessoa de fora dizendo que o
    /// problema continua; isto e o time corrigindo o proprio engano, antes ou
    /// depois de ela ver. Chamar os dois pelo mesmo nome faria a contagem de
    /// "quantas vezes o relator discordou" incluir movimentos que o relator nunca
    /// soube que aconteceram.</para>
    ///
    /// <para>O payload diz se o fechamento <b>chegou a ser publico</b>: dentro da
    /// janela de espera ninguem viu, e ai o engano se corrigiu sem custo nenhum
    /// para quem esta de fora. E essa diferenca que mede se a janela serve.</para>
    /// </summary>
    ReportClosureCancelled,

    /// <summary>
    /// Alguem do time liberou o relato para o publico.
    ///
    /// <para><b>E o unico evento que abre um relato para quem nao o escreveu</b>, e
    /// por isso ele existe: sem a linha, a pergunta "quem decidiu publicar isto, e
    /// quando" nao teria resposta — e e a pergunta que aparece no dia em que algo
    /// publicado nao devia ter sido.</para>
    ///
    /// <para>O payload guarda <b>quanto tempo o relato esperou</b>. Fila que demora
    /// nao e detalhe de operacao aqui: enquanto ela demora, quem relatou ve a
    /// promessa de aparecer e nao aparece.</para>
    /// </summary>
    ReportPublished,

    /// <summary>
    /// Alguem do time decidiu que o relato <b>nao</b> vai a publico.
    ///
    /// <para><b>Nao e apagar, e nao e encerrar.</b> O relato continua no painel,
    /// continua no ciclo, e quem escreveu continua acompanhando pelo link. A recusa
    /// fala so da vitrine.</para>
    ///
    /// <para>Existe como evento para a contagem que importa nesta etapa: <b>quanto
    /// do que chega nao pode ser publicado</b>. Uma taxa alta nao diz que o time
    /// e rigoroso — diz que o aviso antes de escrever nao esta sendo lido.</para>
    /// </summary>
    ReportModerationRejected,
}
