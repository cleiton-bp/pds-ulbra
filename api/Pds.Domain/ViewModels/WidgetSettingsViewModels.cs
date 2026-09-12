using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// Como a ferramenta de relato aparece no site do cliente.
///
/// <para>Sai igual nas duas rotas — a do painel, que exige sessao, e a publica,
/// que o proprio quadro chama. A forma ser a mesma e o que permite a tela do
/// painel mostrar a ferramenta de verdade como previa, em vez de um desenho dela
/// que envelhece sozinho.</para>
///
/// <para><b>Projeto sem linha no banco nao e erro:</b> a resposta vem com os
/// padroes de <see cref="Pds.Domain.Entities.WidgetSettingsDefaults"/>, e quem le
/// nao precisa saber se alguem ja salvou alguma coisa.</para>
/// </summary>
/// <param name="IsEnabled">Falso tira a ferramenta do site sem ninguem editar o HTML.</param>
/// <param name="AccentColor">Cor do gatilho em <c>#rrggbb</c>. Nulo e o acento do produto.</param>
/// <param name="Position">De que canto inferior a ferramenta sai.</param>
/// <param name="Theme">Claro, escuro, ou o sistema de quem visita.</param>
/// <param name="LauncherLabel">O texto dentro do gatilho.</param>
/// <param name="Title">O titulo dentro do quadro.</param>
/// <param name="Placeholder">O texto cinza da caixa vazia.</param>
/// <param name="SuccessMessage">A frase acima do protocolo, na confirmacao.</param>
/// <param name="ShowsTypeField">Mostra ou esconde o seletor de tipo.</param>
/// <param name="DefaultReportType">O tipo pre-marcado, e o gravado quando o seletor nao aparece.</param>
public record WidgetSettingsViewModel(
    bool IsEnabled,
    string? AccentColor,
    WidgetPositionEnum Position,
    WidgetThemeEnum Theme,
    string LauncherLabel,
    string Title,
    string Placeholder,
    string SuccessMessage,
    bool ShowsTypeField,
    ReportTypeEnum DefaultReportType);
