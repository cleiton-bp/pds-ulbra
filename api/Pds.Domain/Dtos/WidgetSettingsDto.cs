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
/// <para>Entao a rota substitui a linha inteira, e a tela manda os dez campos
/// sempre. Em troca, ela precisa ter lido antes de escrever — o que ela faz.</para>
///
/// <para><b>Os tipos anulaveis aqui nao querem dizer "opcional".</b> Sem eles, um
/// campo que a tela esquecesse de mandar chegaria como <c>false</c> ou <c>Bug</c>
/// em silencio, e a ferramenta de alguem se desligaria sozinha. Anulavel e o que
/// permite ao servico ver a falta e recusar. A unica excecao e
/// <see cref="AccentColor"/>, em que nulo e valor.</para>
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

    /// <example>Relatar</example>
    public string? LauncherLabel { get; set; }

    /// <example>Conte o que aconteceu</example>
    public string? Title { get; set; }

    public string? Placeholder { get; set; }

    public string? SuccessMessage { get; set; }

    /// <example>true</example>
    public bool? ShowsTypeField { get; set; }

    /// <example>Bug</example>
    public ReportTypeEnum? DefaultReportType { get; set; }
}
