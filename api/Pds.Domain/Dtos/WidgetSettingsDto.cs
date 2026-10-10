using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// A configuracao inteira, como o painel a envia.
///
/// <para><b>Nao ha campo opcional aqui, e essa e a decisao.</b> As outras rotas de
/// alteracao deste sistema aceitam corpo parcial, em que campo ausente quer dizer
/// "nao mexa". Aqui isso nao funciona: <c>AccentColor</c> nulo e um <b>valor</b> —
/// quer dizer "use o acento do produto" —, e num corpo parcial ele seria
/// indistinguivel de "nao mexa na cor". Voltar a cor ao padrao viraria impossivel
/// de expressar.</para>
///
/// <para>Entao a rota substitui a linha inteira, e a tela manda todos os campos
/// sempre. Em troca, ela precisa ter lido antes de escrever — o que ela faz.</para>
///
/// <para><b>Os tipos anulaveis aqui nao querem dizer "opcional".</b> Sem eles, um
/// campo que a tela esquecesse de mandar chegaria como <c>false</c> em silencio, e a
/// ferramenta de alguem se desligaria sozinha. Anulavel e o que permite ao servico
/// ver a falta e recusar. As excecoes sao <see cref="AccentColor"/>,
/// <see cref="LauncherTextColor"/> e <see cref="DefaultReportType"/>, em que nulo e
/// valor: o acento do produto, a cor do texto automatica, e o primeiro tipo ativo.</para>
/// </summary>
public class WidgetSettingsDto
{
    /// <summary>Falso tira a ferramenta do site sem ninguem editar o HTML.</summary>
    /// <example>true</example>
    public bool? IsEnabled { get; set; }

    /// <summary>Cor do gatilho em <c>#rrggbb</c>. Nulo usa o acento do produto.</summary>
    /// <example>#2f6f4e</example>
    public string? AccentColor { get; set; }

    /// <example>BottomRight</example>
    public WidgetPositionEnum? Position { get; set; }

    /// <example>Auto</example>
    public WidgetThemeEnum? Theme { get; set; }

    /// <summary>A distancia do canto, na horizontal, de 0 a 200 pixels.</summary>
    /// <example>20</example>
    public int? OffsetX { get; set; }

    /// <summary>A distancia do canto, na vertical, de 0 a 200 pixels.</summary>
    /// <example>20</example>
    public int? OffsetY { get; set; }

    /// <example>None</example>
    public WidgetLauncherIconEnum? LauncherIcon { get; set; }

    /// <summary>So o icone, sem o texto. Exige <see cref="LauncherIcon"/> diferente de <c>None</c>.</summary>
    /// <example>false</example>
    public bool? LauncherIconOnly { get; set; }

    /// <example>Medium</example>
    public WidgetLauncherSizeEnum? LauncherSize { get; set; }

    /// <example>Pill</example>
    public WidgetLauncherShapeEnum? LauncherShape { get; set; }

    /// <summary>
    /// A cor do texto e do icone sobre o botao, em <c>#rrggbb</c>. Nulo e automatico —
    /// e, como <see cref="AccentColor"/>, nulo e valor.
    /// </summary>
    /// <example>#ffffff</example>
    public string? LauncherTextColor { get; set; }

    /// <example>false</example>
    public bool? LauncherShadow { get; set; }

    /// <summary>Como o botao fica no celular. <c>IconOnly</c> exige um icone.</summary>
    /// <example>Same</example>
    public WidgetMobileModeEnum? MobileMode { get; set; }

    /// <summary>
    /// As paginas onde o botao nao aparece, ate 20: caminho exato (<c>/checkout</c>) ou
    /// comeco terminado em <c>*</c> (<c>/login/*</c>). Lista vazia e valor; ausente e
    /// recusado, como os outros campos.
    /// </summary>
    public List<string>? HiddenPaths { get; set; }

    /// <example>Relatar</example>
    public string? LauncherLabel { get; set; }

    /// <example>Conte o que aconteceu</example>
    public string? Title { get; set; }

    /// <summary>
    /// Aceita <c>{{primeiroNome}}</c>, <c>{{protocolo}}</c>, <c>{{tipo}}</c> e
    /// <c>{{projeto}}</c>, com o padrao depois da barra: <c>{{primeiroNome|pessoa}}</c>.
    /// </summary>
    /// <example>Obrigado, {{primeiroNome}}! Anote o protocolo {{protocolo}}.</example>
    public string? SuccessMessage { get; set; }

    /// <example>Enviar</example>
    public string? SubmitLabel { get; set; }

    /// <example>Em poucas palavras, o que aconteceu?</example>
    public string? ReportTitleQuestion { get; set; }

    /// <example>O botão de pagar não responde</example>
    public string? ReportTitlePlaceholder { get; set; }

    /// <example>O que é</example>
    public string? TypeFieldLabel { get; set; }

    /// <example>Mais detalhes</example>
    public string? MoreDetailsLabel { get; set; }

    /// <example>Como podemos te chamar</example>
    public string? NameQuestion { get; set; }

    public string? PublicNotice { get; set; }

    /// <summary>
    /// A frase do topo do acompanhamento. Aceita as variaveis da confirmacao e
    /// <c>{{etapa}}</c>.
    /// </summary>
    /// <example>{{primeiroNome|Olá}}, o seu relato está em {{etapa}}.</example>
    public string? TrackingIntro { get; set; }

    /// <example>true</example>
    public bool? ShowsTypeField { get; set; }

    /// <summary>
    /// O identificador publico do tipo pre-marcado — um tipo <b>ativo</b> do projeto —,
    /// ou nulo para o padrao: o primeiro tipo ativo, na ordem do projeto.
    /// </summary>
    public Guid? DefaultReportType { get; set; }

    /// <summary>
    /// Como a ferramenta pergunta o titulo ("em poucas palavras, o que aconteceu?"):
    /// opcional, obrigatoria ou escondida. Obrigatorio informar.
    /// </summary>
    /// <example>Optional</example>
    public ReportTitleModeEnum? ReportTitleMode { get; set; }
}
