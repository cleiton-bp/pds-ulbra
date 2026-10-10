using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Como a ferramenta de relato aparece no site de um projeto.
///
/// <para><b>Uma linha por projeto, e ela nasce so quando alguem salva.</b> Os
/// padroes vivem no codigo, nao no banco: um projeto sem linha nao e um projeto
/// quebrado, e sim um que nunca precisou mudar nada. Criar a linha junto com o
/// projeto obrigaria a escolher valores em nome de quem nem abriu a tela, e
/// deixaria os projetos criados antes desta tela como excecao a tratar.</para>
///
/// <para><b>Por que coluna, e nao um campo livre.</b> O contexto do relato usa
/// chave e valor porque a lista do que se captura ainda vai crescer; aqui a lista
/// e fechada e acordada — cada campo com um tipo e um limite. Como
/// coluna, cada um se explica no proprio banco e o tipo errado nao entra.</para>
/// </summary>
public class ProjectWidgetSettings : PdsBaseEntity
{
    /// <summary>
    /// Os tetos dos tres textos. Moram aqui, e nao no mapeamento, porque quem
    /// grava e quem valida precisam do mesmo numero e so o dominio e visivel para
    /// os dois — como em <see cref="Report.MaxTextLength"/>.
    ///
    /// <para>Sao curtos de proposito. Sao textos que aparecem dentro de um quadro
    /// de 360 pixels: o que nao cabe ali nao e configuracao, e paragrafo.</para>
    ///
    /// <para>O texto de dentro da caixa livre era o quarto, e passou a ser de cada
    /// tipo de relato (<see cref="ProjectReportType.TextBoxPrompt"/>): a pergunta certa
    /// para um defeito nao e a certa para uma duvida.</para>
    /// </summary>
    public const int MaxLauncherLabelLength = 40;

    public const int MaxTitleLength = 60;
    public const int MaxSuccessMessageLength = 200;
    public const int MaxSubmitLabelLength = 30;
    public const int MaxReportTitleQuestionLength = 80;
    public const int MaxReportTitlePlaceholderLength = 80;
    public const int MaxTypeFieldLabelLength = 40;
    public const int MaxMoreDetailsLabelLength = 40;
    public const int MaxNameQuestionLength = 80;

    /// <summary>
    /// Os dois textos de frase inteira tem mais folga: o aviso explica o que acontece
    /// com o relato, e a frase do acompanhamento pode levar variaveis.
    /// </summary>
    public const int MaxPublicNoticeLength = 300;

    public const int MaxTrackingIntroLength = 300;

    /// <summary>O tamanho de <c>#rrggbb</c>. A forma curta e expandida antes de gravar.</summary>
    public const int MaxAccentColorLength = 7;

    /// <summary>
    /// A distancia do canto, em pixels, nos dois eixos. Zero encosta na borda; 200 ja
    /// tira o botao do canto num telefone. Mais do que isso nao e canto, e meio da
    /// pagina — e o quadro aberto deixaria de caber.
    /// </summary>
    public const int MinOffset = 0;

    public const int MaxOffset = 200;

    /// <summary>
    /// Quantas paginas podem esconder o botao, e o tamanho de cada caminho. Vinte cobre
    /// o pagamento, o login e as poucas telas em que o botao atrapalha; uma lista maior
    /// que isso e sinal de que o botao devia aparecer so em algumas — e isso e outra
    /// configuracao.
    /// </summary>
    public const int MaxHiddenPaths = 20;

    public const int MaxHiddenPathLength = 200;

    /// <summary>Projeto a que esta configuracao pertence. Uma linha por projeto.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// Desliga a ferramenta no site inteiro sem ninguem tocar no script colado.
    ///
    /// <para>E a unica opcao sem substituto: a alternativa seria pedir ao time do
    /// cliente que editasse o HTML do site para tirar uma linha — e devolver
    /// depois.</para>
    /// </summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Cor do gatilho e do botao de enviar, em <c>#rrggbb</c>.
    ///
    /// <para><b>Nulo quer dizer "use o acento do produto"</b>, e e o padrao — e
    /// por isso que gravar esta configuracao substitui a linha inteira em vez de
    /// alterar campo a campo: num corpo parcial, campo ausente e campo nulo
    /// seriam a mesma coisa, e voltar a cor para o padrao viraria impossivel.</para>
    ///
    /// <para>A cor do texto por cima nao se escolhe: ela e derivada da luminancia
    /// desta, senao a primeira pessoa a escolher amarelo perde o rotulo.</para>
    /// </summary>
    public string? AccentColor { get; set; }

    /// <summary>De que canto a ferramenta sai: um dos quatro.</summary>
    public WidgetPositionEnum Position { get; set; } = WidgetPositionEnum.BottomRight;

    /// <summary>
    /// A distancia do canto ate o botao, na horizontal, em pixels. Vale tambem para o
    /// quadro aberto, ate onde a janela de quem visita deixar.
    /// </summary>
    public int OffsetX { get; set; } = 20;

    /// <summary>A distancia do canto ate o botao, na vertical, em pixels.</summary>
    public int OffsetY { get; set; } = 20;

    /// <summary>O desenho dentro do botao. Nenhum e o padrao: so o texto.</summary>
    public WidgetLauncherIconEnum LauncherIcon { get; set; } = WidgetLauncherIconEnum.None;

    /// <summary>
    /// O botao mostra so o icone, sem o texto: fica quadrado (redondo, na pilula), e o
    /// texto vira a dica e o nome que o leitor de tela le — nunca some.
    ///
    /// <para><b>Exige um icone escolhido</b>, e a gravacao recusa sem ele: botao vazio
    /// no canto do site nao diz o que faz.</para>
    /// </summary>
    public bool LauncherIconOnly { get; set; }

    /// <summary>Pequeno, medio (o de hoje) ou grande.</summary>
    public WidgetLauncherSizeEnum LauncherSize { get; set; } = WidgetLauncherSizeEnum.Medium;

    /// <summary>Pilula (o de hoje), arredondado ou quadrado.</summary>
    public WidgetLauncherShapeEnum LauncherShape { get; set; } = WidgetLauncherShapeEnum.Pill;

    /// <summary>
    /// A cor do texto e do icone sobre a cor do botao, em <c>#rrggbb</c>.
    ///
    /// <para><b>Nulo e automatico</b>, e e o padrao: a cor sai da luminancia da cor do
    /// botao, a que tiver mais contraste. Escolher e decisao do cliente — a marca dele
    /// pode pedir o branco que a conta nao escolheria; o painel avisa quando o contraste
    /// fica abaixo do que a WCAG pede, mas nao impede.</para>
    /// </summary>
    public string? LauncherTextColor { get; set; }

    /// <summary>Uma sombra embaixo do botao, para ele se destacar de um site claro. Sem, de fabrica.</summary>
    public bool LauncherShadow { get; set; }

    /// <summary>Como o botao fica numa janela estreita: igual, so o icone, ou escondido.</summary>
    public WidgetMobileModeEnum MobileMode { get; set; } = WidgetMobileModeEnum.Same;

    /// <summary>
    /// As paginas do site do cliente onde o botao nao aparece — o pagamento, o login.
    ///
    /// <para>Cada uma e um caminho comecando por <c>/</c>, sem <c>?</c> nem <c>#</c>:
    /// exato (<c>/checkout</c>), ou um comeco terminado em <c>*</c> (<c>/login/*</c>, que
    /// vale para <c>/login</c> e para tudo embaixo dele). Quem compara e a ferramenta, com
    /// o caminho da pagina — a regra mora num lugar so, em <c>embed/launcher.ts</c>.</para>
    /// </summary>
    public List<string> HiddenPaths { get; set; } = [];

    /// <summary>Claro, escuro, ou o que o sistema de quem visita disser.</summary>
    public WidgetThemeEnum Theme { get; set; } = WidgetThemeEnum.Auto;

    /// <summary>O texto dentro do gatilho, o botao que fica parado na pagina.</summary>
    public string LauncherLabel { get; set; } = string.Empty;

    /// <summary>O titulo dentro do quadro. Nunca o nome do projeto: aquele e nome interno.</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// A frase acima do protocolo, na confirmacao. Aceita variaveis — o primeiro nome,
    /// o protocolo, o tipo e o projeto —, porque e depois de enviar que esses dados
    /// existem. Ver <c>WidgetText</c>.
    /// </summary>
    public string SuccessMessage { get; set; } = string.Empty;

    /// <summary>O texto do botao que envia o relato.</summary>
    public string SubmitLabel { get; set; } = string.Empty;

    /// <summary>A pergunta do titulo, acima da linha curta.</summary>
    public string ReportTitleQuestion { get; set; } = string.Empty;

    /// <summary>O exemplo cinza dentro da linha do titulo.</summary>
    public string ReportTitlePlaceholder { get; set; } = string.Empty;

    /// <summary>O nome do seletor de tipo.</summary>
    public string TypeFieldLabel { get; set; } = string.Empty;

    /// <summary>O nome da caixa livre quando ela vem depois das perguntas do tipo.</summary>
    public string MoreDetailsLabel { get; set; } = string.Empty;

    /// <summary>A pergunta do nome, quando o projeto pergunta.</summary>
    public string NameQuestion { get; set; } = string.Empty;

    /// <summary>O aviso de que o relato pode virar publico, antes de a pessoa escrever.</summary>
    public string PublicNotice { get; set; } = string.Empty;

    /// <summary>
    /// A frase do topo da pagina de acompanhamento. Mora aqui, e nao numa tabela da
    /// pagina, porque e a mesma voz da ferramenta: quem escreve um escreve o outro, na
    /// mesma tela. Aceita as variaveis da confirmacao e a etapa em que o relato esta.
    /// </summary>
    public string TrackingIntro { get; set; } = string.Empty;

    /// <summary>Mostra ou esconde o seletor de tipo.</summary>
    public bool ShowsTypeField { get; set; } = true;

    /// <summary>
    /// Qual tipo vem pre-marcado quando o seletor aparece — e qual e gravado quando
    /// ele esta escondido.
    ///
    /// <para><b>Nulo e o padrao: o primeiro tipo ativo</b>, na ordem do projeto. O
    /// tipo escolhido que for desativado depois tambem cai no primeiro ativo, na
    /// leitura — a ferramenta nunca pre-marca o que ela nao oferece.</para>
    /// </summary>
    public long? DefaultReportTypeId { get; set; }

    /// <summary>
    /// Como a ferramenta pergunta o titulo — "em poucas palavras, o que aconteceu?".
    /// Opcional de fabrica; obrigatoria, a API recusa o relato sem ele.
    /// </summary>
    public ReportTitleModeEnum ReportTitleMode { get; set; } = ReportTitleModeEnum.Optional;
}
