using Pds.ApiBase.Attributes;
using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O que a pessoa de fora escreveu.
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
/// proposito: esta e a tabela que mais cresce e a que o painel lista o tempo todo,
/// entao o filtro de isolamento vira comparacao de coluna em vez de juncao.</para>
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

    /// <summary>Conta dona do relato. E por este campo que o filtro global isola.</summary>
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
    public string TrackingCode { get; set; } = string.Empty;

    /// <summary>
    /// Hash do token que vai no link de acompanhamento. O valor original existe
    /// so na URL entregue uma unica vez — se o painel conseguisse mostra-lo de
    /// novo, qualquer vazamento do banco abriria o relato de todo mundo.
    ///
    /// Nao confundir com o <see cref="TrackingCode"/>: o protocolo identifica, o
    /// token abre. E por isso que o protocolo pode ser curto e falado.
    /// </summary>
    public string AccessTokenHash { get; set; } = string.Empty;

    /// <summary>Defeito, melhoria ou duvida.</summary>
    public ReportTypeEnum Type { get; set; }

    /// <summary>O relato como a pessoa escreveu, com tamanho limitado no servidor.</summary>
    public string Text { get; set; } = string.Empty;

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

    /// <summary>O que veio junto com o relato, em pares de chave e valor.</summary>
    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<ReportContext> Contexts { get; set; } = [];
}
