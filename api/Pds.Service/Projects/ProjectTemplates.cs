using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Service.PublicStages;

namespace Pds.Service.Projects;

/// <summary>
/// Os modelos com que um projeto pode nascer, como dado: as colunas do quadro, a
/// etapa publica de cada uma, os tipos de relato com a coluna em que entram e se o
/// time trabalha em sprints.
///
/// <para><b>Num lugar so, e como dado.</b> A criacao do projeto le o modelo e grava;
/// ela nao sabe o que e Kanban nem Scrum. Modelo novo e uma entrada nova aqui, e nao
/// um <c>if</c> a mais no servico.</para>
///
/// <para><b>O quadro simples reusa os conjuntos de fabrica</b> (a jornada de
/// <see cref="FactoryPublicStages"/>, os tipos de <see cref="ReportTypeDefaults"/>),
/// e e por isso que quem so digita o nome continua recebendo exatamente o projeto de
/// antes. Os outros modelos reusam o que da para reusar e trocam so o que o jeito de
/// trabalhar pede.</para>
///
/// <para><b>Tudo editavel depois</b>, como todo padrao de fabrica: o modelo e o ponto
/// de partida, e o projeto nao lembra de qual veio.</para>
///
/// <para>Os nomes e frases <b>tem acento de proposito</b>, como nos conjuntos de
/// fabrica: nao sao mensagens do sistema, sao o que o time e quem relatou leem na
/// tela, e o cliente reescreve quando quiser.</para>
/// </summary>
public static class ProjectTemplates
{
    /// <summary>
    /// Uma coluna do quadro, na ordem, e a etapa publica em que ela entra (pelo
    /// rotulo). Sem etapa, a coluna nasce sem ligacao.
    /// </summary>
    public sealed record TemplateColumn(string Name, string? PublicStage);

    /// <summary>
    /// Um tipo de relato e a coluna em que ele entra (pelo nome). Sem coluna, o relato
    /// vai para a primeira coluna ativa — o caminho de fabrica.
    /// </summary>
    public sealed record TemplateReportType(ReportTypeDefault Type, string? InitialColumn);

    /// <summary>Um modelo inteiro.</summary>
    /// <param name="Kind">Qual e.</param>
    /// <param name="PublicStages">A jornada publica, na ordem — entre tres e sete, como sempre.</param>
    /// <param name="Columns">As colunas, na ordem; a ultima e a que encerra, pela regra de fabrica do ciclo.</param>
    /// <param name="ReportTypes">Os tipos de relato, na ordem.</param>
    /// <param name="SprintsEnabled">
    /// Se o projeto ja nasce trabalhando em sprints. So entao a configuracao do ciclo
    /// ganha linha propria — sem sprints, os padroes do codigo bastam.
    /// </param>
    public sealed record ProjectTemplate(
        ProjectTemplateEnum Kind,
        IReadOnlyList<FactoryPublicStages.Definition> PublicStages,
        IReadOnlyList<TemplateColumn> Columns,
        IReadOnlyList<TemplateReportType> ReportTypes,
        bool SprintsEnabled);

    /// <summary>O modelo pedido. Valor fora da lista e recusado, e nao trocado pelo padrao.</summary>
    public static ProjectTemplate For(ProjectTemplateEnum kind) => kind switch
    {
        ProjectTemplateEnum.SimpleBoard => SimpleBoard,
        ProjectTemplateEnum.Support => Support,
        ProjectTemplateEnum.Kanban => Kanban,
        ProjectTemplateEnum.Scrum => Scrum,
        _ => throw new ArgumentException("Modelo de projeto desconhecido."),
    };

    /// <summary>
    /// Os tipos de fabrica, cada um entrando na coluna indicada (ou na primeira ativa,
    /// sem indicacao).
    /// </summary>
    private static IReadOnlyList<TemplateReportType> FactoryTypes(string? initialColumn)
        => ReportTypeDefaults.Factory.Select(type => new TemplateReportType(type, initialColumn)).ToList();

    /// <summary>
    /// O quadro simples: o projeto de sempre.
    ///
    /// <para><b>Tres colunas, e nao uma.</b> Com uma coluna so o quadro nao anda: ela
    /// era a entrada e o fim ao mesmo tempo, e o time precisava achar a configuracao
    /// antes de mover o primeiro card. "A fazer, Fazendo, Feito" e o que quem chega de
    /// um quadro simples espera no primeiro minuto.</para>
    ///
    /// <para><b>Ja ligadas ao andamento publico.</b> Sem a ligacao, o relato andava por
    /// dentro e quem relatou continuava lendo "Recebido", sem ninguem perceber. A etapa
    /// vem pelo rotulo do conjunto de fabrica; se um dia ele mudar e o rotulo sumir, a
    /// coluna so nasce sem ligacao — nada quebra.</para>
    ///
    /// <para>Os tipos de fabrica nao escolhem coluna: sem escolha, o relato vai para a
    /// primeira coluna ativa, que e "A fazer". Assim o caminho "o cliente nao
    /// configurou" e o caminho comum, exercitado por todo projeto novo.</para>
    /// </summary>
    private static readonly ProjectTemplate SimpleBoard = new(
        ProjectTemplateEnum.SimpleBoard,
        FactoryPublicStages.All,
        [
            new("A fazer", "Recebido"),
            new("Fazendo", "Em desenvolvimento"),
            new("Feito", "Concluído"),
        ],
        FactoryTypes(initialColumn: null),
        SprintsEnabled: false);

    /// <summary>
    /// Kanban: uma fila de entrada antes do "A fazer" e uma revisao antes do "Feito".
    ///
    /// <para><b>As cinco etapas de fabrica, uma por coluna.</b> O Backlog e onde o
    /// relato espera sem ninguem ter olhado ("Recebido"); passar para "A fazer" ja e o
    /// time ter lido e decidido ("Em analise"); a revisao e a equipe conferindo antes
    /// de publicar ("Em teste pela equipe").</para>
    ///
    /// <para><b>Todo relato entra no Backlog, escrito no tipo.</b> E a primeira coluna
    /// de qualquer jeito, mas com a escolha explicita a tela de Tipos mostra para onde
    /// o relato vai, e reordenar as colunas nao muda a entrada sem ninguem perceber.</para>
    /// </summary>
    private static readonly ProjectTemplate Kanban = new(
        ProjectTemplateEnum.Kanban,
        FactoryPublicStages.All,
        [
            new("Backlog", "Recebido"),
            new("A fazer", "Em análise"),
            new("Fazendo", "Em desenvolvimento"),
            new("Em revisão", "Em teste pela equipe"),
            new("Feito", "Concluído"),
        ],
        FactoryTypes(initialColumn: "Backlog"),
        SprintsEnabled: false);

    /// <summary>
    /// Scrum: o quadro com revisao e as sprints ja ligadas.
    ///
    /// <para><b>Sprints de duas semanas, com pontos no card</b>, a duracao de fabrica:
    /// o time que trabalha em ciclos comeca a planejar sem achar a configuracao. O
    /// backlog do Scrum nao e uma coluna — e o card sem sprint —, e por isso o relato
    /// entra na primeira coluna, como no quadro simples, e espera no backlog ate o
    /// time puxa-lo para uma sprint.</para>
    ///
    /// <para>"Em analise" fica na jornada sem coluna, como no quadro simples: quem
    /// quiser mostra-la liga uma coluna a ela na tela de Etapas publicas.</para>
    /// </summary>
    private static readonly ProjectTemplate Scrum = new(
        ProjectTemplateEnum.Scrum,
        FactoryPublicStages.All,
        [
            new("A fazer", "Recebido"),
            new("Fazendo", "Em desenvolvimento"),
            new("Em revisão", "Em teste pela equipe"),
            new("Feito", "Concluído"),
        ],
        FactoryTypes(initialColumn: null),
        SprintsEnabled: true);

    /// <summary>
    /// Atendimento: quem relatou e um cliente esperando resposta, e nao um usuario
    /// mandando defeito para o time de produto.
    ///
    /// <para><b>A jornada fala de atendimento</b>, e tem a etapa que o quadro de
    /// produto nao tem: a vez de quem relatou ("Esperando você", marcada como
    /// esperando quem relatou). Quando a pessoa responde e o card volta para "Em
    /// atendimento", a linha do tempo anda para tras — e por isso "Em atendimento"
    /// aceita que a jornada volte para ela; sem a marca, a volta seria uma regressao e
    /// a pessoa continuaria lendo que a vez e dela.</para>
    ///
    /// <para><b>Problema pergunta, duvida e pedido deixam escrever</b>, como os tipos
    /// de fabrica: o problema precisa ser reproduzido, os outros dois sao texto corrido
    /// de quem escreve. Todos entram em "Novo", que e a triagem do atendimento.</para>
    /// </summary>
    private static readonly ProjectTemplate Support = new(
        ProjectTemplateEnum.Support,
        [
            new(
                "Recebido",
                "Seu relato chegou até a equipe de atendimento e está na fila.",
                "Em breve alguém da equipe vai começar a cuidar dele.",
                false,
                null),
            new(
                "Em atendimento",
                "Alguém da equipe está cuidando do que você enviou.",
                "Se faltar alguma informação, a equipe vai pedir a você por aqui.",
                false,
                null,
                AllowsReturn: true),
            new(
                "Esperando você",
                "A equipe precisa de uma resposta sua para continuar o atendimento.",
                "Assim que você responder, o atendimento continua de onde parou.",
                false,
                null,
                AwaitsReporter: true),
            new(
                "Resolvido",
                "A equipe resolveu o que você relatou, e o atendimento está encerrado.",
                null,
                true,
                PublicOutcomeEnum.Done),
        ],
        [
            new("Novo", "Recebido"),
            new("Em atendimento", "Em atendimento"),
            new("Aguardando quem relatou", "Esperando você"),
            new("Resolvido", "Resolvido"),
        ],
        [
            new(new ReportTypeDefault("Problema", ReportTypeIconEnum.Bug, CardColorEnum.Red,
                [
                    "O que você estava tentando fazer?",
                    "O que deu errado?",
                    "O que você esperava que acontecesse?",
                ],
                ShowsTextBox: false, TextBoxPrompt: null), "Novo"),
            new(new ReportTypeDefault("Dúvida", ReportTypeIconEnum.Question, CardColorEnum.Purple,
                [],
                ShowsTextBox: true, TextBoxPrompt: "Qual é a sua dúvida?"), "Novo"),
            new(new ReportTypeDefault("Pedido", ReportTypeIconEnum.Other, CardColorEnum.Blue,
                [],
                ShowsTextBox: true, TextBoxPrompt: "O que você precisa que a equipe faça?"), "Novo"),
        ],
        SprintsEnabled: false);
}
