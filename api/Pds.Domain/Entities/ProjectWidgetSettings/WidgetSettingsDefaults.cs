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

    public const string LauncherLabel = "Relatar";
    public const string Title = "Conte o que aconteceu";

    public const string Placeholder =
        "Descreva o que você viu, e onde. Se puder, diga o que esperava que acontecesse.";

    public const string SuccessMessage =
        "Recebemos. Anote o protocolo — é com ele que você acompanha.";

    public const bool ShowsTypeField = true;
    public const ReportTypeEnum DefaultReportType = ReportTypeEnum.Bug;
}
