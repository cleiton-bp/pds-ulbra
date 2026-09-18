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
/// <param name="PublicStageLabel">
/// O passo da jornada em que quem relatou ve este relato, ou <b>nulo</b> quando ele
/// nao aparece em nenhum.
///
/// <para>Viaja na lista sem ser desenhado nela, e isso e deliberado: a lista
/// responde "o que ainda nao tratei", e uma segunda etiqueta em toda linha
/// disputaria essa leitura. Quem le este campo e a <b>tela do relato aberto</b>,
/// que e onde alguem decide mover — inclusive na resposta do proprio movimento, que
/// e como ela sabe o que aquele movimento causou la fora sem ter de buscar o
/// detalhe de novo.</para>
///
/// <para>Buscar de novo e justamente o que nao da: abrir o detalhe <b>grava</b> um
/// evento de leitura, e refazer essa busca a cada movimento mediria cliques do time
/// em vez de leituras.</para>
/// </param>
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
    string? PublicStageLabel,
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
/// <param name="PublicStageLabel">
/// O passo da jornada em que quem relatou ve este relato, ou <b>nulo</b> quando ele
/// nao aparece em nenhum.
///
/// <para>E o unico campo desta resposta que conta o outro lado, e existe porque quem
/// move o relato precisa saber o que o movimento causa la fora — sem isso, "mexi em
/// algo que a pessoa ve" e "mexi em algo que so importa aqui dentro" ficam
/// indistinguiveis para quem esta decidindo.</para>
///
/// <para><b>Nulo nao diz por que.</b> Pode ser coluna fora do mapa, projeto sem
/// jornada, ou relato que entrou antes de a jornada existir. Distinguir os tres
/// exigiria um campo a mais que ficaria <b>desatualizado no primeiro movimento</b>,
/// porque esta resposta nao e buscada de novo — e aviso errado e pior que aviso
/// nenhum. Onde a diferenca importa e na tela de Etapas publicas, que a mostra.</para>
/// </param>
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
    string? PublicStageLabel,
    DateTime CreatedAt,
    IReadOnlyList<ReportContextViewModel> Contexts);


/// <summary>
/// Um passo da jornada, como quem relatou o le.
///
/// <para><b>Tudo aqui foi escrito para ser lido por quem esta de fora.</b> O rotulo
/// e a frase sao os que o cliente redigiu pensando no usuario final dele. Nao ha
/// identificador, nao ha posicao e nao ha nenhuma das marcas de configuracao —
/// terminal, permite retorno, aguarda o relator —, porque nenhuma delas significa
/// alguma coisa para quem so quer saber do proprio problema.</para>
///
/// <para><b>O desfecho tambem nao sai</b>, nesta versao. Ele so tem sentido junto
/// de um relato encerrado, e encerrar e a etapa seguinte do trabalho; manda-lo
/// agora seria publicar um campo sem o texto que o explica.</para>
/// </summary>
/// <param name="Label">O nome do passo.</param>
/// <param name="Description">A frase que explica o passo.</param>
/// <param name="NextStep">O que vem depois, ou nulo quando o cliente nao quis dizer.</param>
/// <param name="ReachedAt">
/// Quando o relato chegou a este passo, ou <b>nulo</b> se ele nunca chegou.
///
/// <para>Vem dos <b>eventos</b>, e nao da posicao: um relato pode pular etapas —
/// basta o estado interno dele apontar direto para o quarto passo —, e marcar como
/// percorrido tudo que esta antes seria contar uma historia que nao aconteceu.</para>
/// </param>
/// <param name="IsCurrent">O passo em que o relato esta agora.</param>
public record PublicStageViewModel(
    string Label,
    string Description,
    string? NextStep,
    DateTime? ReachedAt,
    bool IsCurrent);

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
/// <para><b>O andamento entra por <c>Journey</c>, e nao por um campo de situacao.</b>
/// Uma string "Em analise" responderia onde o relato esta e calaria o resto — por
/// onde passou, quando, e o que vem depois. A jornada inteira responde as tres, e e
/// o que a pessoa abre a pagina para saber.</para>
///
/// <para><b>Ela e montada campo a campo, a partir da entidade, e nunca serializada
/// dela.</b> A diferenca nao e de estilo: com serializacao, a coluna que alguem
/// acrescentar amanha a <c>project_public_stages</c> — uma nota interna, um
/// responsavel — sairia por aqui sem ninguem decidir isso. Campo novo nasce
/// invisivel, e e essa a regra.</para>
/// </summary>
/// <param name="TrackingCode">O protocolo, o mesmo que a pessoa anotou.</param>
/// <param name="Type">Defeito, melhoria ou duvida, como ela escolheu.</param>
/// <param name="Text">O que ela escreveu, inteiro.</param>
/// <param name="CreatedAt">Quando o relato entrou.</param>
/// <param name="Journey">
/// A jornada do projeto, na ordem, com o que ja foi percorrido marcado. <b>Vazia</b>
/// quando o projeto nao tem jornada nenhuma — e a pagina diz isso em vez de
/// prometer.
/// </param>
public record PublicReportViewModel(
    string TrackingCode,
    ReportTypeEnum Type,
    string Text,
    DateTime CreatedAt,
    IReadOnlyList<PublicStageViewModel> Journey);
