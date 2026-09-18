using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Um passo da jornada que quem relatou acompanha — "Recebido", "Em analise",
/// "Concluido".
///
/// <para><b>Nao e o estado de dentro com outro nome.</b> A fila de trabalho tem a
/// granularidade que o time precisa: "Code Review", "QA", "Aguardando merge". Quem
/// esta de fora nao precisa de nenhuma das tres — precisa saber que o problema
/// dele esta sendo corrigido. Varios estados caem numa etapa so, e e essa perda de
/// detalhe que e o produto.</para>
///
/// <para><b>Entre tres e sete.</b> O minimo existe porque uma jornada de duas
/// etapas nao conta uma historia — vira "chegou" e "acabou". O maximo existe
/// porque acima de sete a jornada volta a ser o organograma interno, so que com
/// palavras mais bonitas. Os dois sao regra de gravacao, e nao sugestao de
/// tela.</para>
///
/// <para><b>Texto e do cliente, desfecho e nosso.</b> O rotulo e a frase sao
/// escritos por quem conhece o proprio usuario. O <see cref="Outcome"/> nao:
/// ver <see cref="PublicOutcomeEnum"/>.</para>
/// </summary>
public class ProjectPublicStage : PdsBaseEntity
{
    /// <summary>
    /// Teto do rotulo. O mesmo do estado interno, e pelo mesmo motivo: e rotulo de
    /// um passo numa linha do tempo, e o que nao cabe ali nao e rotulo, e frase.
    /// </summary>
    public const int MaxLabelLength = 40;

    /// <summary>
    /// Teto da frase explicativa e do "o que vem depois".
    ///
    /// <para>Curto de proposito. Esta e a tela que alguem abre do telefone, em pe,
    /// para saber de uma coisa so — e um paragrafo ali nao e lido. Quem precisa de
    /// mais de duas linhas para explicar um passo tem etapa demais, nao texto de
    /// menos.</para>
    /// </summary>
    public const int MaxSentenceLength = 160;

    /// <summary>Minimo de etapas na jornada. Abaixo disso ela nao conta uma historia.</summary>
    public const int MinCount = 3;

    /// <summary>Maximo de etapas na jornada. Acima disso ela vira o organograma de dentro.</summary>
    public const int MaxCount = 7;

    /// <summary>
    /// Projeto dono da etapa. A jornada e de cada sistema, como a fila de trabalho:
    /// quem cuida de dois produtos conta duas historias diferentes.
    /// </summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// O nome do passo, como quem relatou le. Unico dentro do projeto, sem
    /// diferenciar maiuscula de minuscula — duas etapas com o mesmo rotulo numa
    /// linha do tempo nao teriam como ser distinguidas por quem a le.
    /// </summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>
    /// A frase que explica o passo. <b>Obrigatoria</b>: um rotulo sozinho e
    /// exatamente o que a ferramenta de dentro ja dava, e a etapa publica existe
    /// para dizer o que aquilo significa para quem esta esperando.
    /// </summary>
    public string Description { get; set; } = string.Empty;

    /// <summary>
    /// O que vem depois, se o cliente quiser dizer. Opcional porque a ultima etapa
    /// nao tem depois, e porque nem todo passo tem um seguinte previsivel.
    /// </summary>
    public string? NextStep { get; set; }

    /// <summary>
    /// A ordem da jornada. Como no estado interno, nao e unica: reordenar reescreve
    /// a lista inteira de uma vez, e exigir unicidade faria a troca de duas
    /// posicoes esbarrar no meio do caminho.
    /// </summary>
    public int Position { get; set; }

    /// <summary>
    /// A etapa em que o trabalho do time acaba.
    ///
    /// <para><b>Terminal nao quer dizer encerrado.</b> Depois dela ainda vem a
    /// confirmacao de quem relatou — que e acao da pessoa, e nao estado do time. A
    /// modelagem trata isso deixando a etapa terminal ser uma etapa como as outras,
    /// e nao "a ultima da lista": o passo seguinte cabe sem mexer nesta
    /// tabela.</para>
    ///
    /// <para>Mais de uma etapa pode ser terminal — e assim que uma jornada
    /// acomoda finais diferentes.</para>
    /// </summary>
    public bool IsTerminal { get; set; }

    /// <summary>
    /// A etapa aceita que a jornada volte para ela.
    ///
    /// <para>Por padrao a linha do tempo nao anda para tras: regressao de dentro
    /// nao vira regressao publica, porque quem acompanha perde a confianca quando o
    /// que ja andou desanda. Esta marca e a excecao combinada — e e por ela que a
    /// reabertura vai funcionar.</para>
    /// </summary>
    public bool AllowsReturn { get; set; }

    /// <summary>
    /// A etapa esta esperando quem relatou, e nao o time.
    ///
    /// <para><b>Ainda nao e lida por ninguem.</b> Nasce junto com a tabela porque e
    /// uma coluna da tabela que esta sendo criada agora: guardar a decisao aqui
    /// custa nada hoje e custaria uma migracao depois. Quem a le e o pedido de
    /// informacao, que vem junto com o aviso e a confirmacao.</para>
    /// </summary>
    public bool AwaitsReporter { get; set; }

    /// <summary>
    /// Qual final esta etapa representa. Nulo em etapa que nao e terminal, e
    /// obrigatorio na que e: uma etapa terminal sem desfecho seria um fim sem
    /// explicacao.
    /// </summary>
    public PublicOutcomeEnum? Outcome { get; set; }
}
