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
/// <param name="AcceptsQuestionsDefault">
/// Como a caixa "aceito responder duvidas" vem marcada no formulario.
///
/// <para><b>Vem de outra tabela, e isso e deliberado.</b> O valor mora nas regras
/// do ciclo, porque e la que a resposta significa alguma coisa — e quem precisa
/// dele para <b>desenhar</b> e a ferramenta. Esta resposta e "tudo que o quadro
/// precisa para aparecer", e nao "o conteudo da tabela de configuracao do
/// quadro".</para>
///
/// <para><b>O padrao nao e a resposta.</b> Ele so decide o estado inicial da
/// caixa; a escolha final e de quem escreve o relato, e o projeto nao manda
/// nela.</para>
/// </param>
/// <param name="IdentityMode">
/// Como quem relata e reconhecido neste projeto.
///
/// <para><b>A ferramenta precisa saber, e o cliente nao configura isso nela.</b> E
/// o modo que decide se ela guarda um codigo e oferece "os meus relatos", ou se
/// cada relato sai como um link solto. Sai junto do resto porque esta resposta e
/// "tudo que o quadro precisa para aparecer".</para>
///
/// <para>Nao e segredo: quem abre a pagina do cliente descobriria o mesmo relatando
/// uma vez e vendo se veio codigo.</para>
/// </param>
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
    ReportTypeEnum DefaultReportType,
    bool AcceptsQuestionsDefault,
    ReporterIdentityModeEnum IdentityMode);
