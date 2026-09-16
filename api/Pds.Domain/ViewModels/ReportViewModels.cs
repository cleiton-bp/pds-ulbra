using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// O relato recem-criado, como a ferramenta o mostra a quem acabou de escrever.
///
/// <para>Sai daqui o minimo: o que a pessoa precisa para voltar. Nada do lado de
/// dentro atravessa — nem o identificador do projeto, nem o da conta.</para>
/// </summary>
/// <param name="TrackingCode">O protocolo, para anotar e repetir.</param>
/// <param name="AccessToken">
/// O que abre o acompanhamento. <b>Devolvido uma unica vez</b>: o banco fica so com
/// o hash, e nenhuma rota consegue revela-lo de novo.
/// </param>
/// <param name="CreatedAt">Quando o relato entrou, em UTC.</param>
public record CreatedReportViewModel(
    string TrackingCode,
    string AccessToken,
    DateTime CreatedAt);

/// <summary>
/// Um relato na lista do painel.
///
/// <para>O <see cref="Text"/> vem inteiro, e nao cortado. Cortar aqui obrigaria
/// uma segunda rota so para ler o resto — e enquanto ela nao existisse, o time
/// leria pela metade o que a pessoa escreveu. Quem limita e a pagina; quem corta
/// para caber e a tela.</para>
///
/// <para>Nao sai daqui o <c>AccessTokenHash</c>, e nem podia: quem tem o hash nao
/// abre o acompanhamento, mas ja sabe o que procurar num vazamento de banco.</para>
/// </summary>
/// <param name="PublicId">Identificador do relato para as rotas do painel.</param>
/// <param name="TrackingCode">O protocolo, que a pessoa que relatou tambem tem.</param>
/// <param name="Type">Defeito, melhoria ou duvida.</param>
/// <param name="Text">O relato como foi escrito.</param>
/// <param name="Route">O caminho da pagina de onde saiu, sem query e sem fragmento.</param>
/// <param name="Origin">O dominio informado pela pagina hospedeira. Indicio, nunca prova.</param>
/// <param name="StatePublicId">Onde o relato esta na fila; <b>nulo</b> quando o projeto nao tinha coluna ativa na hora em que ele chegou.</param>
/// <param name="StateName">O nome da coluna como ele esta <b>agora</b> — renomear a coluna muda o que a lista mostra, e e isso mesmo: a lista diz onde o relato esta, nao onde ele esteve.</param>
/// <param name="CreatedAt">Quando o relato entrou, em UTC.</param>
public record ReportSummaryViewModel(
    Guid PublicId,
    string TrackingCode,
    ReportTypeEnum Type,
    string Text,
    string? Route,
    string? Origin,
    Guid? StatePublicId,
    string? StateName,
    DateTime CreatedAt);

/// <summary>
/// Uma pagina de relatos e o total que existe fora dela.
///
/// <para>O total viaja junto porque a lista do painel cresce por um botao
/// "carregar mais": sem ele, a tela nao sabe se o botao ainda tem o que trazer, e
/// so descobre pedindo uma pagina vazia.</para>
/// </summary>
public record ReportPageViewModel(IReadOnlyList<ReportSummaryViewModel> Items, int Total);

/// <summary>
/// Quantos relatos ha em cada coluna da fila.
/// </summary>
/// <param name="StatePublicId">Identificador do estado; <b>nulo</b> na linha dos que ainda nao tem lugar na fila.</param>
/// <param name="StateName">Nome do estado; nulo na mesma linha.</param>
/// <param name="IsActive">Falso quando o estado foi aposentado. Sempre verdadeiro na linha sem estado.</param>
/// <param name="Total">Quantos relatos estao ali.</param>
public record ReportStateCountViewModel(
    Guid? StatePublicId,
    string? StateName,
    bool IsActive,
    int Total);

/// <summary>Um par do contexto que veio junto com o relato, sem ninguem digitar.</summary>
/// <param name="Key">Nome do dado, em ingles e snake_case: <c>user_agent</c>, <c>viewport_width</c>.</param>
/// <param name="Value">O valor como chegou, sempre texto.</param>
public record ReportContextViewModel(string Key, string? Value);

/// <summary>
/// Um relato aberto, com o contexto que a lista nao mostra.
///
/// <para>O contexto so aparece aqui porque e a resposta a uma pergunta que so
/// nasce depois de ler o relato — "em que navegador isso aconteceu?". Na lista ele
/// seria ruido em toda linha para servir a uma.</para>
/// </summary>
/// <param name="PublicId">Identificador do relato.</param>
/// <param name="TrackingCode">O protocolo, que a pessoa que relatou tambem tem.</param>
/// <param name="Type">Defeito, melhoria ou duvida.</param>
/// <param name="Text">O relato como foi escrito.</param>
/// <param name="Route">O caminho da pagina de onde saiu, sem query e sem fragmento.</param>
/// <param name="Origin">O dominio informado pela pagina hospedeira. Indicio, nunca prova.</param>
/// <param name="StatePublicId">Onde o relato esta na fila; <b>nulo</b> quando o projeto nao tinha coluna ativa quando ele chegou.</param>
/// <param name="StateName">O nome da coluna como ele esta agora. E de la que o relato vai ser movido.</param>
/// <param name="CreatedAt">Quando o relato entrou, em UTC.</param>
/// <param name="Contexts">O que veio junto, em ordem de chave.</param>
public record ReportDetailViewModel(
    Guid PublicId,
    string TrackingCode,
    ReportTypeEnum Type,
    string Text,
    string? Route,
    string? Origin,
    Guid? StatePublicId,
    string? StateName,
    DateTime CreatedAt,
    IReadOnlyList<ReportContextViewModel> Contexts);


/// <summary>
/// O relato como quem o escreveu o ve, na pagina publica de acompanhamento.
///
/// <para><b>Tipo proprio, e nao heranca do detalhe do painel.</b> Esta e a unica
/// resposta do sistema que vai para alguem que nao e do time do cliente, e a
/// separacao e estrutural de proposito: com heranca, o campo que a etapa 3
/// acrescentar ao detalhe interno — comentario, responsavel, nota de triagem —
/// apareceria aqui sem ninguem decidir isso. Vazamento por heranca nao da erro
/// em teste nenhum.</para>
///
/// <para><b>O que fica de fora, e por que.</b> A rota e a origem descrevem a
/// pagina onde o relato nasceu e nao dizem nada a quem estava nela; o contexto e
/// dado tecnico coletado para o time; e o <b>nome do projeto</b> e como o cliente
/// chama o produto dele por dentro, que nao e nosso para mostrar ao usuario
/// final. Sobra o que a propria pessoa escreveu, mais o que ela ja recebeu na
/// tela de confirmacao.</para>
///
/// <para><b>Nao ha campo de situacao</b> porque nao ha situacao: estado interno e
/// a etapa 3, e devolver um <c>"Recebido"</c> fixo seria inventar um conceito que
/// o dominio nao tem para ter de mante-lo depois.</para>
/// </summary>
/// <param name="TrackingCode">O protocolo, o mesmo que a pessoa anotou.</param>
/// <param name="Type">Defeito, melhoria ou duvida, como ela escolheu.</param>
/// <param name="Text">O que ela escreveu, inteiro.</param>
/// <param name="CreatedAt">Quando o relato entrou.</param>
public record PublicReportViewModel(
    string TrackingCode,
    ReportTypeEnum Type,
    string Text,
    DateTime CreatedAt);
