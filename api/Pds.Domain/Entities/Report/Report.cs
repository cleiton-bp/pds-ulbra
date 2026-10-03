using Pds.ApiBase.Attributes;
using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Um card do trabalho do time — o relato que a pessoa de fora escreveu, ou o
/// card que o proprio time criou (<see cref="Kind"/>).
///
/// <para><b>O nome da tabela e do relato porque ele veio primeiro.</b> O card do
/// time entrou depois, na mesma tabela, para andar pelos mesmos estados e contar a
/// mesma historia. As colunas do lado de fora — protocolo, token, tipo e texto de
/// quem relatou — ficam nulas nele, e o banco garante as duas regras: relato sem
/// elas nao entra, e card do time com elas tambem nao.</para>
///
/// <para><b>E a primeira tabela do sistema que nasce sem conta e sem sessao.</b>
/// Todas as outras chegam por alguem que entrou no painel; esta chega por um
/// visitante anonimo do site do cliente, e o unico dado de identificacao que a
/// requisicao traz e a chave publica. Dai as duas colunas que nao existem em
/// nenhuma outra tabela: o <see cref="TrackingCode"/>, que a pessoa le e repete,
/// e o <see cref="AccessTokenHash"/>, que abre o acompanhamento.</para>
///
/// <para><b>Por que repete <see cref="AccountId"/>.</b> A chave e o endereco
/// autorizado alcancam a conta pelo projeto, e aqui o desenho e o contrario de
/// proposito: esta e a tabela que mais cresce, e saber de qual conta e o relato
/// nao pode custar uma juncao. O filtro de acesso compara o
/// <see cref="ProjectId"/>, que tambem e coluna daqui — e continua sem juncao.</para>
/// </summary>
public class Report : PdsBaseEntity
{
    /// <summary>
    /// Teto do texto no servidor. Mora aqui, e nao no mapeamento, porque quem grava
    /// e quem valida precisam do mesmo numero e so o dominio e visivel para os dois.
    ///
    /// <para>O limite que o cliente escolhe para o formulario dele e menor e ainda
    /// nao existe; este vale para todo mundo e existe para o custo nao fugir.</para>
    /// </summary>
    public const int MaxTextLength = 5000;

    /// <summary>
    /// Quanto cabe no nome de quem relatou.
    ///
    /// <para>Curto de proposito: e um nome, e nao um espaco livre. Sem teto, o
    /// campo vira um segundo relato — e num projeto publico identificado ele sai
    /// ao lado do texto, onde caberia qualquer coisa que a moderacao teria de ler
    /// duas vezes.</para>
    /// </summary>
    public const int MaxReporterNameLength = 80;

    /// <summary>
    /// Quantos relatos liberados a lista publica devolve de uma vez.
    ///
    /// <para><b>Menor que o da lista pessoal, e de proposito.</b> Ali sao os
    /// relatos da propria pessoa, que ela reconhece de relance; aqui sao textos
    /// inteiros de estranhos, lidos num quadro de 360 por 520. E a rota e publica
    /// e sem credencial nenhuma — o custo da resposta nao pode crescer com o
    /// tamanho do projeto.</para>
    /// </summary>
    public const int MaxPublishedListed = 20;

    /// <summary>
    /// Teto do titulo: o do card do time, o que o time reescreve no relato e o que
    /// a pessoa responde na ferramenta. Um so, para o titulo que a pessoa escreveu
    /// sempre caber no lugar do que o time escreveria.
    /// </summary>
    public const int MaxTitleLength = 200;

    /// <summary>
    /// Quantas etiquetas um card leva. Passar disso deixa de separar e vira ruido —
    /// e a linha do card nao tem onde mostrar.
    /// </summary>
    public const int MaxLabelsPerCard = 10;

    /// <summary>
    /// A folga entre dois cards vizinhos na ordem do quadro. Grande o bastante para
    /// por um card entre dois uma vintena de vezes no mesmo lugar antes de a coluna
    /// precisar ser renumerada, e pequena o bastante para o inteiro nunca acabar.
    /// </summary>
    public const long BoardRankGap = 1L << 20;

    /// <summary>
    /// Teto da descricao do card do time, em Markdown. Maior que o texto do relato:
    /// e o time descrevendo o proprio trabalho, com lista e trecho de codigo.
    /// </summary>
    public const int MaxDescriptionLength = 10000;

    /// <summary>
    /// De onde o card veio: de fora, pela ferramenta, ou do time, no painel. Ver
    /// <see cref="CardKindEnum"/>.
    /// </summary>
    public CardKindEnum Kind { get; set; }

    /// <summary>
    /// O numero curto do card no projeto — o #42 que o time fala e escreve.
    ///
    /// <para><b>Interno, e separado do protocolo.</b> O protocolo e de quem relatou
    /// e vale no sistema inteiro; o numero e do time e vale dentro do projeto.
    /// Nenhuma rota publica o devolve.</para>
    ///
    /// <para><b>Pode pular, nunca repete.</b> Vem do contador do projeto
    /// (<see cref="Project.LastCardNumber"/>), somado numa gravacao so; um card que
    /// falha depois de reservar o numero deixa o buraco, e e so.</para>
    /// </summary>
    public int Number { get; set; }

    /// <summary>
    /// O titulo do time. Obrigatorio no card do time; no relato, e o que o time
    /// reescreveu — nulo ate alguem reescrever, e o painel mostra o de quem relatou
    /// (<see cref="ReporterTitle"/>).
    ///
    /// <para><b>Interno.</b> Nenhuma rota publica o devolve: quem relatou ve so o
    /// que escreveu.</para>
    /// </summary>
    public string? Title { get; set; }

    /// <summary>
    /// O titulo que a pessoa escreveu na ferramenta, respondendo "em poucas
    /// palavras, o que aconteceu?". Nulo quando ela nao respondeu, e sempre no card
    /// do time.
    ///
    /// <para><b>Nunca muda.</b> O time reescreve em <see cref="Title"/>, e este fica
    /// guardado — e e o unico titulo que volta para quem relatou.</para>
    /// </summary>
    public string? ReporterTitle { get; set; }

    /// <summary>
    /// A descricao do card do time, em Markdown. <b>Nula no relato</b>: ali o texto
    /// e o de quem relatou, e o time nao o reescreve.
    /// </summary>
    public string? Description { get; set; }

    /// <summary>
    /// Quando o card saiu da tela de Trabalho. Nulo enquanto esta nela.
    ///
    /// <para>Arquivado se le e se comenta, e so; mover e editar pedem desarquivar
    /// antes. No relato, arquivar so existe com a regra do ciclo ligada, e o
    /// relato aberto e encerrado junto — quem relatou recebe o motivo.</para>
    /// </summary>
    public DateTime? ArchivedAt { get; set; }

    /// <summary>
    /// Quem do time criou o card. Nulo no relato: quem escreveu nao tem usuario
    /// aqui.
    /// </summary>
    public long? CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }

    /// <summary>
    /// Quem do time esta com o card. Um so. Nulo enquanto ninguem assumiu.
    ///
    /// <para><b>Quem sai do time continua aqui, como registro</b>: perde o acesso, e
    /// o painel o mostra marcado como fora do time ate alguem trocar. A marca e lida
    /// na hora, e voltar ao time a apaga sozinha.</para>
    /// </summary>
    public long? AssigneeUserId { get; set; }
    public User? AssigneeUser { get; set; }

    /// <summary>A prioridade do projeto que o time escolheu. Nulo e sem prioridade — e como o card nasce.</summary>
    public long? PriorityId { get; set; }
    public ProjectPriority? Priority { get; set; }

    /// <summary>O prazo: so a data, sem hora — sem fuso para confundir. Nulo e sem prazo.</summary>
    public DateOnly? DueDate { get; set; }

    /// <summary>Conta dona do relato, repetida do projeto para nao custar juncao.</summary>
    public long AccountId { get; set; }
    public Account Account { get; set; } = null!;

    /// <summary>Projeto de onde o relato veio, resolvido pela chave publica da requisicao.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// Onde o relato esta na fila de trabalho do projeto.
    ///
    /// <para><b>E anulavel, e vai continuar sendo.</b> Projeto que ainda nao criou
    /// estado nenhum nao tem onde por o relato, e recusar o relato por causa disso
    /// seria perder o que veio de fora por uma configuracao que o cliente nao fez —
    /// a pessoa que escreveu nao tem nada a ver com isso.</para>
    ///
    /// <para><b>E cache, e nao a verdade.</b> A verdade e a sequencia de eventos;
    /// esta coluna existe para a lista do painel nao precisar reconstruir o estado
    /// de cada relato a cada abertura da tela.</para>
    /// </summary>
    public long? ProjectStateId { get; set; }
    public ProjectState? ProjectState { get; set; }

    /// <summary>
    /// O lugar do card na coluna do quadro: o menor fica em cima. So se compara com
    /// os cards da mesma coluna.
    ///
    /// <para><b>Com folga entre vizinhos.</b> Por um card entre dois e escolher um
    /// numero no meio, sem mexer nos outros; quando a folga acaba, a coluna inteira e
    /// renumerada de uma vez. O card que chega sem ser arrastado vem do topo do
    /// projeto (<see cref="Project.BoardTopRank"/>), que fica acima de
    /// tudo.</para>
    /// </summary>
    public long BoardRank { get; set; }

    /// <summary>
    /// Quando o card entrou na coluna em que esta, ou voltou a ela — reaberto, ou
    /// desarquivado por quem relatou —, em UTC. E o que a ultima coluna do quadro usa
    /// para mostrar so o que entrou nela ha pouco tempo — o encerrado de meses atras
    /// continua na lista.
    /// </summary>
    public DateTime StateChangedAt { get; set; }

    /// <summary>
    /// A etapa publica em que o relato esta, <b>como cache</b>. Nula enquanto ele
    /// nao apareceu em nenhuma — porque o estado dele nao esta mapeado, ou porque o
    /// projeto ainda nao tem jornada.
    ///
    /// <para>A verdade e a sequencia de eventos, como no estado interno. Esta coluna
    /// existe para a pagina de acompanhamento nao ter de reconstruir o caminho
    /// inteiro a cada abertura — e ela e escrita <b>depois</b> do evento, sempre.</para>
    /// </summary>
    public long? ProjectPublicStageId { get; set; }
    public ProjectPublicStage? ProjectPublicStage { get; set; }

    /// <summary>
    /// O protocolo que a pessoa le, repete ao telefone e digita para acompanhar.
    /// Alfabeto sem <c>0</c>, <c>O</c>, <c>1</c> e <c>I</c>, que se confundem lidos
    /// em voz alta. Unico em todo o sistema, porque quem digita nao sabe de qual
    /// projeto o relato dele e.
    /// </summary>
    public string? TrackingCode { get; set; }

    /// <summary>
    /// Hash do token que vai no link de acompanhamento. O valor original existe
    /// so na URL entregue uma unica vez — se o painel conseguisse mostra-lo de
    /// novo, qualquer vazamento do banco abriria o relato de todo mundo.
    ///
    /// Nao confundir com o <see cref="TrackingCode"/>: o protocolo identifica, o
    /// token abre. E por isso que o protocolo pode ser curto e falado.
    /// </summary>
    public string? AccessTokenHash { get; set; }

    /// <summary>Defeito, melhoria ou duvida. Nulo no card do time.</summary>
    public ReportTypeEnum? Type { get; set; }

    /// <summary>
    /// O relato como a pessoa escreveu, com tamanho limitado no servidor. Nulo no
    /// card do time, que tem titulo e descricao.
    /// </summary>
    public string? Text { get; set; }

    /// <summary>
    /// So o caminho da pagina de onde o relato foi aberto. A parte depois do
    /// <c>?</c> e descartada antes de gravar: e ali que costumam viajar token,
    /// documento e e-mail, e guardar isso seria comecar o produto vazando dado.
    /// </summary>
    public string? Route { get; set; }

    /// <summary>
    /// Dominio da pagina que embutiu a ferramenta, informado por ela mesma.
    /// Guardado como veio, inclusive fora da lista de autorizados: e indicio para
    /// investigar depois, nunca prova de origem.
    /// </summary>
    public string? Origin { get; set; }

    /// <summary>
    /// Quem relatou aceita responder duvidas da equipe sobre este relato.
    ///
    /// <para><b>E escolha dela, e nao configuracao do projeto.</b> Quem relatou um
    /// defeito as pressas pode nao querer virar parte da investigacao, e prometer
    /// resposta a quem nao vai responder deixa o relato pendurado esperando. O
    /// projeto so escolhe como a caixa vem marcada; a resposta e de quem
    /// escreve.</para>
    ///
    /// <para><b>Anulavel, e nulo e um terceiro estado</b>: o relato que entrou antes
    /// de a pergunta existir, a quem ninguem perguntou nada. Grava-lo como "nao
    /// aceita" poria na boca da pessoa uma resposta que ela nunca deu — e o painel
    /// diria isso a quem for ler. Na pratica o efeito e o mesmo do "nao": sem um
    /// sim, nao se abre pedido de informacao.</para>
    /// </summary>
    public bool? AcceptsQuestions { get; set; }

    /// <summary>
    /// O codigo pessoal de quem escreveu, quando o projeto usa esse modo.
    ///
    /// <para><b>Anulavel, e vai continuar.</b> Nulo e o relato que entrou sob o modo
    /// protocolo, ou antes de o modo existir — e ele continua valendo pelo link, que
    /// e o que impede uma troca de configuracao de tornar ilegivel o que ja
    /// estava aqui.</para>
    ///
    /// <para>O vinculo e o que permite "os meus relatos": sem ele, cada um seria um
    /// link solto, que e o problema que este modo existe para resolver.</para>
    /// </summary>
    public long? ReporterCodeId { get; set; }
    public ReporterCode? ReporterCode { get; set; }

    /// <summary>
    /// Quando a ultima mudanca de etapa publica passa a valer para quem relatou.
    ///
    /// <para><b>E o agendamento, e nao um aviso.</b> Preenchida, quer dizer que o
    /// time moveu o relato e o lado de fora ainda nao sabe — a janela em que um
    /// movimento errado pode ser desfeito sem ninguem ver. Nula e o estado normal:
    /// ou nao ha espera configurada, ou ela ja venceu e foi aplicada.</para>
    ///
    /// <para><b>E ela que sobrevive, e nao a mensagem.</b> A fila avisa o momento de
    /// olhar; esta coluna e o que diz o que estava agendado. Mensagem perdida deixa
    /// a linha aqui, e a subida da aplicacao a reencontra — o contrario nao seria
    /// verdade, porque o que espera dentro do broker mora no armazenamento local do
    /// no, sem replicacao.</para>
    ///
    /// <para><b>Reescrever adia.</b> Mover de novo dentro da janela troca esta data,
    /// e a mensagem antiga, ao chegar, encontra um vencimento no futuro e se
    /// descarta sozinha. E assim que o desfazer funciona sem cancelar nada.</para>
    /// </summary>
    public DateTime? PublicStageDueAt { get; set; }

    /// <summary>
    /// Nome de quem relatou, quando o projeto pede e a pessoa quis dar.
    ///
    /// <para><b>Nulo e o normal.</b> O campo e opcional em toda configuracao: o
    /// produto nunca precisou do nome para funcionar, e passar a exigi-lo seria
    /// trocar o motivo pelo qual este relato pode ser anonimo.</para>
    ///
    /// <para><b>Coletar e uma coisa; publicar e outra.</b> Preenchido, o nome e
    /// <b>interno</b> — o time ve, o lado de fora nao. Para ele aparecer sao
    /// precisas duas coisas ao mesmo tempo, e nenhuma sozinha basta: o projeto em
    /// publico identificado, e <see cref="ReporterNameIsPublic"/> verdadeiro.</para>
    /// </summary>
    public string? ReporterName { get; set; }

    /// <summary>
    /// Quem relatou <b>escolheu aparecer</b> junto do relato.
    ///
    /// <para><b>Falso por padrao, e a escolha e de quem escreve.</b> O projeto abre
    /// a possibilidade ao usar o nivel publico identificado; quem decide assinar e
    /// a pessoa, no formulario, com a caixa desmarcada. Marca-la por padrao faria a
    /// escolha acontecer por distracao — e o que esta em jogo e o nome dela ao lado
    /// de um texto que qualquer um le.</para>
    /// </summary>
    public bool ReporterNameIsPublic { get; set; }

    /// <summary>
    /// Se este relato ja pode ser lido por quem nao o escreveu. Ver
    /// <see cref="ReportModerationStateEnum"/>.
    ///
    /// <para><b>Nasce pendente, sempre</b> — inclusive em projeto privado, onde
    /// ninguem vai olhar a fila. E o que torna seguro marcar o projeto como publico
    /// depois: a troca nao publica nada, porque nao ha nada liberado.</para>
    /// </summary>
    public ReportModerationStateEnum ModerationState { get; set; }

    /// <summary>
    /// Quando alguem do time decidiu. <b>Nulo enquanto ninguem decidiu.</b>
    ///
    /// <para>E a data em que o relato passou a poder ser lido la fora — ou em que
    /// se decidiu que nao seria. Nao e a data do relato, e nem sempre existe.</para>
    /// </summary>
    public DateTime? ModeratedAt { get; set; }

    /// <summary>
    /// Quem do time decidiu, ou <b>nulo</b> quando ninguem decidiu ainda — e
    /// tambem quando a conta de quem decidiu foi esvaziada.
    ///
    /// <para>Fica do lado de dentro e nunca sai numa rota publica: quem le a lista
    /// publica esta lendo o relato, e nao a redacao do cliente.</para>
    /// </summary>
    public long? ModeratedByUserId { get; set; }
    public User? ModeratedByUser { get; set; }

    /// <summary>
    /// O protocolo, o tipo e o texto — o que so o relato tem, e o que o lado de
    /// fora mostra.
    ///
    /// <para><b>Para quem monta resposta de fora.</b> As portas publicas so acham
    /// relato, e o banco nao deixa o card do time ter protocolo. Um card do time
    /// chegando aqui e defeito de quem chamou — e falhar alto e melhor do que
    /// devolver um relato em branco para alguem de fora.</para>
    /// </summary>
    public (string TrackingCode, ReportTypeEnum Type, string Text) ReporterFields()
        => Kind == CardKindEnum.Report && TrackingCode is not null && Type is not null && Text is not null
            ? (TrackingCode, Type.Value, Text)
            : throw new InvalidOperationException("O card do time nao tem lado de fora.");

    /// <summary>O que veio junto com o relato, em pares de chave e valor.</summary>
    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<ReportContext> Contexts { get; set; } = [];

    /// <summary>As etiquetas do card. Ate <see cref="MaxLabelsPerCard"/>.</summary>
    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<ReportLabel> Labels { get; set; } = [];
}
