using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O que a ferramenta mostra quando ninguem configurou nada.
///
/// <para><b>Existe uma segunda copia destes valores, e e de proposito.</b> O
/// quadro roda no site do cliente e precisa abrir mesmo quando a leitura da
/// configuracao falha — uma ferramenta que nao aparece porque a rede caiu e pior
/// do que uma com os textos padrao. Entao <c>web/src/embed/settings.ts</c> repete
/// isto, e as duas listas precisam continuar iguais: quem mudar uma frase aqui
/// muda la tambem.</para>
///
/// <para>Os textos sao perguntas, e nao rotulos. "Descreva o problema" produz
/// "nao funciona"; perguntar o que a pessoa viu, onde, e o que esperava produz um
/// relato que da para reproduzir.</para>
/// </summary>
public static class WidgetSettingsDefaults
{
    public const bool IsEnabled = true;

    /// <summary>Nulo e o acento do proprio produto, que acompanha o tema.</summary>
    public const string? AccentColor = null;

    public const WidgetPositionEnum Position = WidgetPositionEnum.BottomRight;
    public const WidgetThemeEnum Theme = WidgetThemeEnum.Auto;

    /// <summary>
    /// A aparencia do botao, toda com o valor que ele tinha antes de ela ser
    /// configuravel: 20 pixels do canto, so o texto, medio, pilula, sem sombra, igual no
    /// celular. O projeto que nunca mexeu continua com o botao de sempre.
    /// </summary>
    public const int OffsetX = 20;

    public const int OffsetY = 20;
    public const WidgetLauncherIconEnum LauncherIcon = WidgetLauncherIconEnum.None;
    public const bool LauncherIconOnly = false;
    public const WidgetLauncherSizeEnum LauncherSize = WidgetLauncherSizeEnum.Medium;
    public const WidgetLauncherShapeEnum LauncherShape = WidgetLauncherShapeEnum.Pill;

    /// <summary>Nulo e automatico: a cor sai da luminancia da cor do botao.</summary>
    public const string? LauncherTextColor = null;

    public const bool LauncherShadow = false;
    public const WidgetMobileModeEnum MobileMode = WidgetMobileModeEnum.Same;

    /// <summary>
    /// Nenhuma pagina esconde o botao. Lista nao cabe em <c>const</c>; e nova a cada
    /// leitura, para ninguem alterar o padrao de todo mundo por engano.
    /// </summary>
    public static IReadOnlyList<string> HiddenPaths => [];

    public const string LauncherLabel = "Relatar";
    public const string Title = "Conte o que aconteceu";

    public const string SuccessMessage =
        "Recebemos. Anote o protocolo — é com ele que você acompanha.";

    /// <summary>O texto do botao que envia o relato.</summary>
    public const string SubmitLabel = "Enviar";

    /// <summary>A pergunta do titulo, acima da linha curta.</summary>
    public const string ReportTitleQuestion = "Em poucas palavras, o que aconteceu?";

    /// <summary>O exemplo cinza dentro da linha do titulo.</summary>
    public const string ReportTitlePlaceholder = "O botão de pagar não responde";

    /// <summary>O nome do seletor de tipo.</summary>
    public const string TypeFieldLabel = "O que é";

    /// <summary>O nome da caixa livre quando ela vem depois das perguntas do tipo.</summary>
    public const string MoreDetailsLabel = "Mais detalhes";

    /// <summary>A pergunta do nome, quando o projeto pergunta.</summary>
    public const string NameQuestion = "Como podemos te chamar";

    /// <summary>
    /// O aviso de que o relato pode virar publico. A frase sobre o nome, que vem
    /// depois, nao e configuravel: ela depende do nivel de visibilidade, e um texto
    /// livre ali poderia prometer o contrario do que o projeto faz.
    /// </summary>
    public const string PublicNotice =
        "Este relato pode virar público. Alguém da equipe lê antes; se for liberado, qualquer pessoa poderá ler o que você escrever aqui.";

    /// <summary>A frase do topo da pagina de acompanhamento, embaixo de "Seu relato".</summary>
    public const string TrackingIntro = "Este é o registro do que você enviou.";

    public const bool ShowsTypeField = true;

    /// <summary>
    /// A pergunta do titulo aparece, e nao obriga: o titulo ajuda o time a reconhecer
    /// o card, mas obrigar faria parte de quem relata desistir antes de enviar.
    /// </summary>
    public const ReportTitleModeEnum ReportTitleMode = ReportTitleModeEnum.Optional;
}
