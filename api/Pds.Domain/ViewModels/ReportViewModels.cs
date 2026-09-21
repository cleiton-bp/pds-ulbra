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
/// <param name="ReporterCode">
/// O código pessoal desta pessoa, quando o projeto usa esse modo; <b>nulo</b> nos
/// outros.
///
/// <para><b>Vem em toda confirmação, e não só na primeira.</b> A ferramenta guarda
/// no navegador e manda de volta no relato seguinte — e se o navegador foi limpo,
/// ou se o código mandado não existia mais, o que chega aqui é um novo. Devolver
/// sempre é o que faz a tela mostrar o código que <b>de fato</b> vale, em vez do
/// que ela achava que valia.</para>
/// </param>
public record CreatedReportViewModel(
    string TrackingCode,
    string AccessToken,
    DateTime CreatedAt,
    string? ReporterCode);

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
/// <param name="AcceptsQuestions">
/// Quem relatou aceita responder duvidas da equipe sobre este relato.
///
/// <para><b>Sao tres estados, e nao dois.</b> Verdadeiro e o sim; falso e o nao; e
/// <b>nulo</b> e o relato que entrou antes de a pergunta existir, a quem ninguem
/// perguntou nada. Mostrar o nulo como "nao aceita" poria na boca da pessoa uma
/// resposta que ela nunca deu.</para>
///
/// <para>Na pratica, o efeito de falso e de nulo e o mesmo: sem um sim, nao se abre
/// pedido de informacao. O que muda e o que a tela diz a quem for ler.</para>
/// </param>
/// <param name="PublicStageDueAt">
/// Quando o ultimo movimento passa a valer para quem relatou, ou <b>nulo</b> quando
/// nao ha espera pendente.
///
/// <para><b>Preenchido, a janela de desfazer esta aberta</b>: o time moveu e o lado
/// de fora ainda nao sabe. Mostrar isto e o que torna a janela util — sem a data na
/// tela, quem moveu por engano nao tem como saber que ainda da tempo, e o desfazer
/// vira sorte.</para>
///
/// <para>Desfazer e mover de volta: nao ha acao propria para isso, e nem precisa —
/// o agendamento e reescrito a cada movimento.</para>
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
    bool? AcceptsQuestions,
    DateTime? PublicStageDueAt,
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
/// <param name="ClosesReport">
/// Mover um relato para esta coluna <b>encerra</b> o relato, e por isso vai pedir
/// desfecho e motivo.
///
/// <para><b>Viaja na contagem porque e aqui que o painel pega a lista de
/// colunas</b>, e a tela precisa saber disto <b>antes</b> de mover — perguntar
/// depois seria mandar o movimento, levar uma recusa e so entao abrir o dialogo,
/// com o seletor ja mostrando a coluna errada. Derivar na tela pela ordem da lista
/// tambem nao serve: ela teria de repetir a regra de qual coluna encerra, e as duas
/// copias divergiriam no dia em que a regra virar configuracao do projeto.</para>
///
/// <para>Verdadeiro em <b>uma</b> linha, no maximo: a ultima coluna ativa. Falso
/// em todas quando o projeto nao tem coluna ativa nenhuma.</para>
/// </param>
/// <param name="Total">Quantos relatos estao ali.</param>
public record ReportStateCountViewModel(
    Guid? StatePublicId,
    string? StateName,
    bool IsActive,
    bool ClosesReport,
    int Total);

/// <summary>
/// O fim do relato, como <b>o time</b> o le.
///
/// <para><b>E o irmao interno de <see cref="PublicClosureViewModel"/>, e nao o
/// mesmo tipo.</b> A diferenca e uma linha — o nome de quem encerrou — e e
/// justamente ela que nao pode vazar. Com um tipo so, bastaria uma tela esquecer
/// de omitir o campo; com dois, a camada publica nao tem o que omitir.</para>
/// </summary>
/// <param name="Outcome">Qual dos quatro finais foi este.</param>
/// <param name="Reason">Por que acabou. E o mesmo texto que quem relatou le.</param>
/// <param name="ClosedAt">Quando acabou, em UTC.</param>
/// <param name="ClosedByName">
/// Quem do time encerrou, ou <b>nulo quando foi o sistema</b> — no fim do prazo do
/// pedido de informacao. Nulo tambem quando a conta do autor foi esvaziada, e ai o
/// certo e nao mostrar nome nenhum em vez de inventar um.
/// </param>
/// <param name="ConfirmedAt">
/// Quando quem relatou confirmou que resolveu, ou nulo enquanto nao houve resposta.
///
/// <para>E a metade da metafora que faltava do lado de dentro: ate aqui o painel
/// so sabia o que o time tinha decidido. Este campo e o time descobrindo se a
/// pessoa concordou.</para>
/// </param>
/// <param name="Satisfaction">A nota de 1 a 5, ou nula.</param>
/// <param name="SatisfactionDeclined">
/// Ele clicou em "prefiro nao responder". <b>Separado da nota nula</b>, porque
/// recusar opinar nao e ausencia de opiniao — e juntar os dois daria uma metrica
/// que parece precisa e nao e.
/// </param>
public record ReportClosureViewModel(
    PublicOutcomeEnum Outcome,
    string Reason,
    DateTime ClosedAt,
    string? ClosedByName,
    DateTime? ConfirmedAt,
    int? Satisfaction,
    bool SatisfactionDeclined);

/// <summary>
/// O pedido de informacao aberto, como <b>o time</b> o le.
/// </summary>
/// <param name="AskedByName">Quem perguntou. Nulo so quando a conta do autor foi esvaziada.</param>
/// <param name="AskedAt">Quando perguntou.</param>
/// <param name="WarnAt">A partir de quando a pagina publica avisa que vai encerrar.</param>
/// <param name="CloseAt">Quando encerra como "sem retorno", se ninguem responder.</param>
public record ReportInfoRequestViewModel(
    string? AskedByName,
    DateTime AskedAt,
    DateTime WarnAt,
    DateTime CloseAt);

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
/// <param name="AcceptsQuestions">
/// Quem relatou aceita responder duvidas da equipe sobre este relato.
///
/// <para><b>Sao tres estados, e nao dois.</b> Verdadeiro e o sim; falso e o nao; e
/// <b>nulo</b> e o relato que entrou antes de a pergunta existir, a quem ninguem
/// perguntou nada. Mostrar o nulo como "nao aceita" poria na boca da pessoa uma
/// resposta que ela nunca deu.</para>
///
/// <para>Na pratica, o efeito de falso e de nulo e o mesmo: sem um sim, nao se abre
/// pedido de informacao. O que muda e o que a tela diz a quem for ler.</para>
/// </param>
/// <param name="PublicStageDueAt">
/// Quando o ultimo movimento passa a valer para quem relatou, ou <b>nulo</b> quando
/// nao ha espera pendente.
///
/// <para><b>Preenchido, a janela de desfazer esta aberta</b>: o time moveu e o lado
/// de fora ainda nao sabe. Mostrar isto e o que torna a janela util — sem a data na
/// tela, quem moveu por engano nao tem como saber que ainda da tempo, e o desfazer
/// vira sorte.</para>
///
/// <para>Desfazer e mover de volta: nao ha acao propria para isso, e nem precisa —
/// o agendamento e reescrito a cada movimento.</para>
/// </param>
/// <param name="CreatedAt">Quando o relato entrou, em UTC.</param>
/// <param name="Closure">
/// O fim do relato, ou <b>nulo</b> enquanto ele nao acabou.
///
/// <para><b>Vem no detalhe e nao no resumo</b>, e a diferenca e de custo: a lista
/// carrega dezenas de relatos por pagina, e uma consulta de fechamento por linha
/// pagaria caro para desenhar algo que a lista nem mostra. Quem precisa disto e a
/// tela do relato aberto — para mostrar o que foi decidido, e para nao oferecer
/// encerrar o que ja acabou.</para>
///
/// <para>Nulo tambem no relato reaberto: a linha antiga continua guardada, mas nao
/// e mais o fim de nada.</para>
/// </param>
/// <param name="InfoRequest">O pedido de informacao aberto, ou nulo quando nao ha.</param>
/// <param name="CanAskInfo">
/// Da para devolver este relato pedindo informacao, <b>agora</b>.
///
/// <para><b>E a conclusao, e nao a configuracao.</b> Falso pode ser o projeto com o
/// recurso desligado, o relato ja encerrado, o pedido ja aberto, ou — o caso que
/// importa — quem escreveu <b>nao ter aceitado responder duvidas</b>. A tela diz
/// qual dos casos e, lendo o que ja tem em maos.</para>
/// </param>
/// <param name="Contexts">O que veio junto, em ordem de chave.</param>
/// <param name="ModerationState">
/// Se este relato ja pode ser lido por quem nao o escreveu.
///
/// <para><b>Viaja no detalhe porque e aqui que o time le o relato.</b> A decisao
/// se toma na fila de moderacao, mas quem abre um relato para responder precisa
/// saber se esta falando em publico — e descobrir isso depois de escrever e
/// descobrir tarde.</para>
///
/// <para>Liberado <b>nao quer dizer visivel</b>: o projeto tambem precisa estar
/// num nivel publico. Sao duas condicoes, e esta e so uma delas.</para>
/// </param>
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
    bool? AcceptsQuestions,
    DateTime? PublicStageDueAt,
    DateTime CreatedAt,
    ReportClosureViewModel? Closure,
    ReportInfoRequestViewModel? InfoRequest,
    bool CanAskInfo,
    ReportModerationStateEnum ModerationState,
    IReadOnlyList<ReportContextViewModel> Contexts);


/// <summary>
/// Um relato na lista pessoal de quem o escreveu.
///
/// <para><b>E resumo, e nao o relato.</b> Aqui a pessoa reconhece qual e qual e
/// decide o que abrir; o texto inteiro, a jornada e a conversa continuam vindo da
/// consulta de um relato so.</para>
///
/// <para><b>Nao carrega o token de acompanhamento.</b> O codigo pessoal diz quais
/// relatos sao dela; o link de cada um e que da poder sobre ele — confirmar,
/// reabrir, responder. Embutir o token aqui faria um codigo de doze simbolos valer
/// tanto quanto todos os links somados.</para>
/// </summary>
/// <param name="TrackingCode">O protocolo, que a pessoa reconhece.</param>
/// <param name="Type">Defeito, melhoria ou duvida.</param>
/// <param name="Excerpt">O comeco do que ela escreveu, para distinguir um do outro.</param>
/// <param name="StageLabel">Em que passo da jornada ele esta, com as palavras do cliente. Nulo quando o projeto nao tem jornada.</param>
/// <param name="IsClosed">Se ja acabou. A lista separa os abertos dos fechados sem precisar abrir cada um.</param>
/// <param name="CreatedAt">Quando entrou, em UTC.</param>
public record ReporterCodeReportViewModel(
    string TrackingCode,
    ReportTypeEnum Type,
    string Excerpt,
    string? StageLabel,
    bool IsClosed,
    DateTime CreatedAt);

/// <summary>
/// A resposta da consulta por codigo pessoal.
///
/// <para><b>Codigo que nao existe devolve lista vazia, e nao uma recusa.</b> E a
/// decisao central desta rota: qualquer diferenca entre "nao existe" e "existe e
/// esta vazio" transforma a consulta num oraculo, e tentar codigos ate a resposta
/// mudar e exatamente como se enumera. Quem digitou errado ve uma lista vazia, o
/// mesmo que veria quem acabou de receber um codigo novo.</para>
/// </summary>
/// <param name="Reports">Os relatos ligados ao codigo, do mais novo para o mais antigo.</param>
/// <param name="HasMore">
/// Ha relato alem dos que vieram.
///
/// <para><b>E um sim ou nao, e nunca um total.</b> A rota e publica e nao pede
/// credencial: dizer quantos entregaria a quem sonda o tamanho da lista de outra
/// pessoa. O aviso basta para quem esta lendo saber que a lista nao e tudo — e o
/// que falta continua alcancavel pelo link de cada relato.</para>
/// </param>
public record ReporterCodeReportsViewModel(
    IReadOnlyList<ReporterCodeReportViewModel> Reports,
    bool HasMore);

/// <summary>
/// Um passo da jornada, como quem relatou o le.
///
/// <para><b>Tudo aqui foi escrito para ser lido por quem esta de fora.</b> O rotulo
/// e a frase sao os que o cliente redigiu pensando no usuario final dele. Nao ha
/// identificador, nao ha posicao e nao ha nenhuma das marcas de configuracao —
/// terminal, permite retorno, aguarda o relator —, porque nenhuma delas significa
/// alguma coisa para quem so quer saber do proprio problema.</para>
///
/// <para><b>O desfecho nao sai daqui</b>, e continua nao saindo. Ele so tem sentido
/// junto de um relato encerrado, e quando isso acontece quem o conta e
/// <see cref="PublicClosureViewModel"/>, com o texto que o explica ao lado —
/// publicar o desfecho num passo da jornada seria dizer "nao sera feito" numa
/// etiqueta, sem motivo nenhum embaixo.</para>
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
/// O fim do relato, como quem o escreveu o le.
///
/// <para><b>Tres campos, e nenhum deles diz quem encerrou.</b> O nome de quem
/// mexeu e pergunta interna — quem esta de fora quer saber o que aconteceu com o
/// problema dele, e expor a pessoa do outro lado convidaria a cobranca individual
/// que a camada publica existe para nao criar.</para>
///
/// <para><b>Nem a confirmacao, nem a nota, nem a reabertura saem por aqui.</b> Sao
/// colunas do mesmo fechamento, e vao aparecer quando houver tela que as escreva;
/// enquanto nao ha, manda-las seria publicar campo que ninguem le e que, no dia em
/// que alguem ler, ja teria sido desenhado sem ninguem decidir.</para>
/// </summary>
/// <param name="Outcome">Qual dos quatro finais foi este.</param>
/// <param name="Reason">
/// Por que acabou, como o time escreveu. <b>Nunca vazio</b>: encerrar sem motivo e
/// recusado antes de a linha existir.
/// </param>
/// <param name="ClosedAt">Quando acabou, em UTC.</param>
/// <param name="ConfirmedAt">
/// Quando quem relatou confirmou que resolveu, ou nulo enquanto ele nao respondeu.
/// </param>
/// <param name="Satisfaction">
/// A nota de 1 a 5 que ele deu, ou nula. <b>Nula nao quer dizer insatisfacao</b>:
/// pode ser que ele nao tenha respondido, e pode ser que tenha recusado — e a
/// recusa esta na propriedade ao lado, fora da escala de proposito.
/// </param>
/// <param name="SatisfactionDeclined">Ele clicou em "prefiro nao responder".</param>
/// <param name="Actions">
/// O que esta pessoa pode fazer <b>agora</b>.
///
/// <para><b>E o que a pagina pode, e nao a configuracao do projeto.</b> A diferenca
/// nao e de estilo: mandar as regras cruas entregaria a quem esta de fora como o
/// cliente organiza o trabalho dele. Aqui sai so a conclusao — "da para reabrir",
/// "a nota e pedida" —, ja cruzada com o estado deste relato.</para>
/// </param>
public record PublicClosureViewModel(
    PublicOutcomeEnum Outcome,
    string Reason,
    DateTime ClosedAt,
    DateTime? ConfirmedAt,
    int? Satisfaction,
    bool SatisfactionDeclined,
    PublicClosureActionsViewModel Actions);

/// <summary>
/// O que quem relatou pode fazer neste relato encerrado.
///
/// <para><b>Nao e a configuracao do projeto</b>, e e por isso que tem nome proprio:
/// cada campo aqui ja e o cruzamento da regra do projeto com o estado deste
/// relato. "Permite reabrir" ligado num relato ja confirmado sai daqui como
/// <c>CanReopen</c> falso, e a pagina nao precisa saber por que.</para>
///
/// <para><b>A pagina nao e a trava.</b> Tudo aqui e conferido de novo quando a acao
/// chega — esconder o botao evita o clique inutil, e nao o pedido malicioso.</para>
/// </summary>
/// <param name="CanConfirm">Ainda da para dizer que resolveu.</param>
/// <param name="CanReopen">
/// Ainda da para dizer que nao resolveu. Falso quando o projeto nao permite, e
/// falso depois de confirmar — quem confirmou encerrou a conversa, e o problema que
/// volta depois disso e outro relato.
/// </param>
/// <param name="AsksSatisfaction">A nota e pedida ao confirmar neste projeto.</param>
/// <param name="SatisfactionStyle">Como a escala aparece. Muda o desenho, e nao o dado.</param>
/// <param name="SatisfactionRequired">
/// Confirmar exige responder. <b>Mesmo assim "prefiro nao responder" existe</b>, e
/// fica fora da escala: obrigar sem saida vira clique sem pensar, e a media passa a
/// medir o clique.
/// </param>
/// <param name="ReopenRequiresComment">Reabrir exige dizer por que.</param>
public record PublicClosureActionsViewModel(
    bool CanConfirm,
    bool CanReopen,
    bool AsksSatisfaction,
    SatisfactionStyleEnum SatisfactionStyle,
    bool SatisfactionRequired,
    bool ReopenRequiresComment);

/// <summary>
/// Uma fala da conversa, como quem relatou a le.
///
/// <para><b>Uma lista so, com os dois lados.</b> Separar a resposta dela em outra
/// lista obrigaria a tela a costurar duas em ordem — e a ordem e o que faz um
/// dialogo ser lido como dialogo.</para>
///
/// <para><b>Nao ha nome de ninguem.</b> Quem escreveu do lado de dentro e pergunta
/// interna; para quem esta de fora, o que importa e se a fala e dela ou da equipe.
/// Expor a pessoa do outro lado convidaria a cobranca individual que a camada
/// publica existe para nao criar.</para>
/// </summary>
/// <param name="PublicId">Identificador da fala, para a tela listar sem inventar chave.</param>
/// <param name="FromReporter">A fala e de quem relatou. Falso e a equipe.</param>
/// <param name="Body">O texto.</param>
/// <param name="CreatedAt">Quando foi escrito, em UTC.</param>
public record PublicMessageViewModel(
    Guid PublicId,
    bool FromReporter,
    string Body,
    DateTime CreatedAt);

/// <summary>
/// O pedido de informacao aberto, como quem relatou o le.
///
/// <para><b>A tela precisa deixar claro de quem e a vez</b>, e e para isso que isto
/// existe. Um relato parado esperando a pessoa e indistinguivel, sem isto, de um
/// relato parado esperando a equipe — e a pessoa que acha que a bola esta com o
/// outro lado nao responde.</para>
/// </summary>
/// <param name="AskedAt">Quando a equipe perguntou.</param>
/// <param name="CloseAt">
/// Quando o relato encerra como "sem retorno", se ninguem responder.
///
/// <para><b>Encerrado assim continua reabrivel</b>, e a tela diz isso: quem nao
/// respondeu em duas semanas pode voltar no mes seguinte, e o produto existe
/// justamente para quem foi esquecido.</para>
/// </param>
/// <param name="IsWarning">
/// O primeiro prazo ja passou, e falta pouco para encerrar.
///
/// <para><b>E estado de tela, e nao um envio.</b> Enquanto nao houver canal de
/// comunicacao, avisar e a pagina dizendo isto — e por isso nao ha nada agendado
/// para este momento.</para>
/// </param>
public record PublicInfoRequestViewModel(
    DateTime AskedAt,
    DateTime CloseAt,
    bool IsWarning);

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
/// <param name="Closure">
/// O fim do relato, ou <b>nulo</b> enquanto ele nao acabou.
///
/// <para><b>E campo proprio, e nao um passo da jornada.</b> A jornada conta por
/// onde o relato andou; o fechamento conta o que foi decidido, e traz o texto que
/// explica. Um relato pode estar na etapa terminal sem ter sido encerrado — e e
/// justamente essa diferenca que a etapa existe para mostrar.</para>
///
/// <para>Nulo tambem no relato que foi encerrado e <b>reaberto</b>: a linha antiga
/// continua guardada, mas ela nao e mais o fim de nada.</para>
/// </param>
/// <param name="Conversation">
/// O que a equipe escreveu para ela, e o que ela respondeu, em ordem. Vazia quando
/// ninguem escreveu nada.
/// </param>
/// <param name="InfoRequest">
/// O pedido de informacao aberto, ou <b>nulo</b> quando a bola nao esta com ela.
/// </param>
/// <param name="CanReply">
/// Ela pode escrever agora.
///
/// <para><b>So enquanto ha pedido aberto</b>, e isso e decisao: canal livre viraria
/// uma caixa de entrada sem dono e sem moderacao, e moderacao ficou de fora desta
/// etapa de proposito. A vez volta para a equipe assim que ela responde.</para>
/// </param>
public record PublicReportViewModel(
    string TrackingCode,
    ReportTypeEnum Type,
    string Text,
    DateTime CreatedAt,
    IReadOnlyList<PublicStageViewModel> Journey,
    PublicClosureViewModel? Closure,
    IReadOnlyList<PublicMessageViewModel> Conversation,
    PublicInfoRequestViewModel? InfoRequest,
    bool CanReply);

/// <summary>
/// Um trecho que a varredura reconheceu como dado sensivel.
///
/// <para><b>E um aviso, e nao um veredito.</b> Nada aqui impede liberar o relato:
/// falso positivo nao pode decidir, e quem decide e sempre alguem que leu. O papel
/// desta lista e so fazer a pessoa olhar de novo para um trecho especifico antes
/// de publicar.</para>
///
/// <para><b>A amostra vem mascarada, mesmo com o texto inteiro ao lado.</b> A
/// etiqueta viaja mais do que o relato — cabe num print, numa captura de suporte,
/// num log do painel —, e repetir o dado ali criaria uma segunda copia dele em
/// lugares que ninguem pensou em proteger.</para>
/// </summary>
/// <param name="Kind">CPF, CNPJ, cartao, e-mail, telefone ou credencial.</param>
/// <param name="Start">Onde o trecho comeca no texto, em caracteres — para a tela marcar.</param>
/// <param name="Length">Quantos caracteres ele ocupa.</param>
/// <param name="Sample">O trecho mascarado.</param>
public record SensitiveFindingViewModel(
    SensitiveDataKindEnum Kind,
    int Start,
    int Length,
    string Sample);

/// <summary>
/// Um relato na fila de moderacao, como o time o le antes de decidir.
///
/// <para><b>O texto vem inteiro.</b> Quem decide publicar precisa ler o que vai
/// publicar — um resumo faria a decisao ser tomada sobre a parte que coube, e o
/// que vaza costuma estar no meio de um paragrafo, nao nas primeiras palavras.</para>
/// </summary>
/// <param name="PublicId">Identificador do relato para as rotas do painel.</param>
/// <param name="TrackingCode">O protocolo, para cruzar com o resto do painel.</param>
/// <param name="Type">Defeito, melhoria ou duvida.</param>
/// <param name="Text">O relato como foi escrito.</param>
/// <param name="ReporterName">
/// Como a pessoa se identificou, ou <b>nulo</b> quando nao deu nome.
///
/// <para>Aparece aqui mesmo quando ela <b>nao</b> quis assinar: coletar e uma
/// coisa, publicar e outra, e quem modera precisa saber quem esta do outro lado
/// para julgar o texto.</para>
/// </param>
/// <param name="ReporterNameIsPublic">Ela quis assinar. So com isto <b>e</b> o projeto em publico identificado o nome sai la fora.</param>
/// <param name="State">Pendente, liberado ou recusado.</param>
/// <param name="ModeratedAt">Quando alguem decidiu; nulo enquanto ninguem decidiu.</param>
/// <param name="ModeratedByName">Quem decidiu; nulo enquanto ninguem decidiu, e tambem quando a conta foi esvaziada.</param>
/// <param name="CreatedAt">Quando o relato entrou, em UTC.</param>
/// <param name="FindingsTruncated">
/// A varredura parou no teto e ha mais trechos do que os que vieram.
///
/// <para><b>Sem isto, doze pareceria "todos".</b> Um texto colado de um log tem
/// centenas de credenciais iguais; listar todas nao ajuda a decidir, mas deixar
/// quem le achar que sao doze ajuda a decidir <b>errado</b>.</para>
/// </param>
/// <param name="Findings">
/// O que a varredura reconheceu no texto. Vazio na esmagadora maioria.
///
/// <para><b>Calculado na leitura, e nao guardado.</b> O achado nao e um fato sobre
/// o relato: e o que temos a dizer a quem esta decidindo <b>agora</b>. Gravado na
/// criacao, ele envelheceria — melhorar um padrao deixaria o passado marcado pelo
/// detector velho, e seria preciso uma migracao para reavaliar a fila.</para>
/// </param>
public record ModerationItemViewModel(
    Guid PublicId,
    string TrackingCode,
    ReportTypeEnum Type,
    string Text,
    string? ReporterName,
    bool ReporterNameIsPublic,
    ReportModerationStateEnum State,
    DateTime? ModeratedAt,
    string? ModeratedByName,
    DateTime CreatedAt,
    IReadOnlyList<SensitiveFindingViewModel> Findings,
    bool FindingsTruncated);

/// <summary>
/// A fila de moderacao de um projeto.
/// </summary>
/// <param name="Items">Os relatos no estado pedido, do mais antigo para o mais novo.</param>
/// <param name="PendingTotal">
/// Quantos ainda esperam decisao, <b>independente do recorte pedido</b>.
///
/// <para>Viaja sempre porque e o numero que o painel mostra na lateral: sem ele,
/// quem abrisse a aba dos ja decididos veria o contador sumir e concluiria que a
/// fila esvaziou.</para>
/// </param>
public record ModerationQueueViewModel(
    IReadOnlyList<ModerationItemViewModel> Items,
    int PendingTotal);

/// <summary>
/// Um relato ja liberado, como qualquer pessoa o le.
///
/// <para><b>Nao ha identificador aqui, e nem o protocolo.</b> O protocolo e curto,
/// falado em voz alta, e e metade da credencial de quem relatou — publica-lo
/// entregaria a estranhos o numero que a propria pessoa usa para voltar.</para>
///
/// <para><b>O texto vem inteiro, e e o mesmo que foi liberado.</b> Cortar aqui
/// faria o que alguem aprovou e o que o mundo le serem coisas diferentes.</para>
/// </summary>
/// <param name="Type">Defeito, melhoria ou duvida.</param>
/// <param name="Text">O relato como foi escrito, e como foi liberado.</param>
/// <param name="StageLabel">Em que passo da jornada ele esta, ou <b>nulo</b> quando nao aparece em nenhum.</param>
/// <param name="IsClosed">Ja acabou, na leitura de quem esta de fora.</param>
/// <param name="ReporterName">
/// Quem assinou, ou <b>nulo</b> — que e o caso da esmagadora maioria.
///
/// <para>So sai preenchido com as <b>duas</b> condicoes ao mesmo tempo: o projeto
/// em publico identificado, e a pessoa tendo escolhido assinar. Uma sozinha nao
/// basta, e e por isso que a regra mora no servidor e nao na tela.</para>
/// </param>
/// <param name="PublishedAt">Quando foi liberado, em UTC. E a data que a lista ordena — e nao a da criacao.</param>
public record PublishedReportViewModel(
    ReportTypeEnum Type,
    string Text,
    string? StageLabel,
    bool IsClosed,
    string? ReporterName,
    DateTime PublishedAt);

/// <summary>
/// A lista publica de um projeto.
///
/// <para><b>Projeto privado responde vazio, e nao uma recusa.</b> Mesma disciplina
/// da consulta por codigo pessoal: a diferenca entre "nao publica" e "publica e
/// nao tem nada" nao diz nada a quem le, e dita em voz alta contaria a
/// configuracao do cliente a qualquer um que colasse a chave publica numa
/// requisicao.</para>
/// </summary>
/// <param name="Reports">Os relatos liberados, do mais recente para o mais antigo.</param>
/// <param name="HasMore">Ha mais alem dos que vieram. Sim ou nao, nunca um total.</param>
public record PublishedReportsViewModel(
    IReadOnlyList<PublishedReportViewModel> Reports,
    bool HasMore);
