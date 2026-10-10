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
/// <param name="Position">De que canto a ferramenta sai: um dos quatro.</param>
/// <param name="Theme">Claro, escuro, ou o sistema de quem visita.</param>
/// <param name="OffsetX">A distancia do canto ate o botao, na horizontal, em pixels.</param>
/// <param name="OffsetY">A distancia do canto ate o botao, na vertical, em pixels.</param>
/// <param name="LauncherIcon">O desenho dentro do botao. <c>None</c> e so o texto.</param>
/// <param name="LauncherIconOnly">
/// So o icone, sem o texto. O texto continua indo: vira a dica e o nome que o leitor de
/// tela le.
/// </param>
/// <param name="LauncherSize">Pequeno, medio ou grande.</param>
/// <param name="LauncherShape">Pilula, arredondado ou quadrado.</param>
/// <param name="LauncherTextColor">A cor do texto sobre o botao em <c>#rrggbb</c>. Nulo e automatico.</param>
/// <param name="LauncherShadow">Sombra embaixo do botao.</param>
/// <param name="MobileMode">Como o botao fica numa janela estreita: igual, so o icone ou escondido.</param>
/// <param name="HiddenPaths">
/// As paginas onde o botao nao aparece. <b>Sai para o site do cliente</b> porque e a
/// ferramenta que compara, com o caminho da pagina que so ela conhece; nao e segredo —
/// quem visita ve onde o botao some.
/// </param>
/// <param name="LauncherLabel">O texto dentro do gatilho.</param>
/// <param name="Title">O titulo dentro do quadro.</param>
/// <param name="SuccessMessage">
/// A frase acima do protocolo, na confirmacao. <b>Sai com as variaveis como foram
/// escritas</b>: quem troca e o quadro, depois de enviar, porque so ele tem o nome e
/// o protocolo.
/// </param>
/// <param name="SubmitLabel">O texto do botao que envia.</param>
/// <param name="ReportTitleQuestion">A pergunta do titulo.</param>
/// <param name="ReportTitlePlaceholder">O exemplo cinza dentro da linha do titulo.</param>
/// <param name="TypeFieldLabel">O nome do seletor de tipo.</param>
/// <param name="MoreDetailsLabel">O nome da caixa livre, quando ela vem depois das perguntas.</param>
/// <param name="NameQuestion">A pergunta do nome.</param>
/// <param name="PublicNotice">O aviso de que o relato pode virar publico.</param>
/// <param name="TrackingIntro">
/// A frase do topo da pagina de acompanhamento, com as variaveis como foram escritas.
/// Sai aqui para o painel editar; a pagina recebe a mesma frase na leitura do relato.
/// </param>
/// <param name="ProjectName">
/// O nome do projeto, para a variavel <c>{{projeto}}</c>.
///
/// <para><b>Nulo quando a confirmacao nao usa a variavel.</b> O nome do projeto e nome
/// interno, e so sai para o site do cliente quando o proprio cliente o escreveu no
/// texto. O painel sempre recebe: e dele.</para>
/// </param>
/// <param name="ShowsTypeField">Mostra ou esconde o seletor de tipo.</param>
/// <param name="Types">
/// Os tipos de relato que a ferramenta oferece: os <b>ativos</b>, na ordem do projeto,
/// cada um com o jeito de perguntar.
///
/// <para><b>Moram em outra tabela, e vem aqui pelo mesmo criterio do resto</b>: esta
/// resposta e tudo o que o quadro precisa para aparecer, e as perguntas de cada tipo
/// sao o proprio formulario.</para>
/// </param>
/// <param name="DefaultReportType">
/// O identificador do tipo pre-marcado, e o enviado quando o seletor nao aparece.
/// <b>Na ferramenta, sempre um dos <c>Types</c></b>: sem escolha, ou com o escolhido
/// desativado, e o primeiro ativo. <b>No painel, a escolha como esta</b>: nulo quando
/// ninguem escolheu (ou o escolhido foi desativado), que e o "primeiro da lista" — a
/// tela precisa distinguir os dois para nao prender o primeiro de hoje ao salvar.
/// </param>
/// <param name="ReportTitleMode">Como a ferramenta pergunta o titulo: opcional, obrigatoria ou escondida.</param>
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
/// <param name="Visibility">
/// Quem pode ver os relatos deste projeto.
///
/// <para><b>Agora a ferramenta le, e no passo anterior nao lia.</b> Quando os tres
/// niveis nasceram, expo-los seria gravar configuracao que nao muda nada; com a
/// moderacao no ar, e o que faz o formulario avisar <b>antes</b> de a pessoa
/// escrever que aquilo pode virar publico — e avisar depois seria avisar
/// tarde.</para>
///
/// <para>Nao e segredo: quem le a lista publica descobre o mesmo sem perguntar
/// nada.</para>
/// </param>
/// <param name="AsksForName">
/// A ferramenta pergunta o nome de quem relata.
///
/// <para>Opcional sempre, e <b>interno por padrao</b>. A caixa de assinar so
/// aparece junto quando o projeto tambem esta em publico identificado: sem os dois,
/// nao ha onde o nome apareceria.</para>
/// </param>
public record WidgetSettingsViewModel(
    bool IsEnabled,
    string? AccentColor,
    WidgetPositionEnum Position,
    WidgetThemeEnum Theme,
    int OffsetX,
    int OffsetY,
    WidgetLauncherIconEnum LauncherIcon,
    bool LauncherIconOnly,
    WidgetLauncherSizeEnum LauncherSize,
    WidgetLauncherShapeEnum LauncherShape,
    string? LauncherTextColor,
    bool LauncherShadow,
    WidgetMobileModeEnum MobileMode,
    IReadOnlyList<string> HiddenPaths,
    string LauncherLabel,
    string Title,
    string SuccessMessage,
    string SubmitLabel,
    string ReportTitleQuestion,
    string ReportTitlePlaceholder,
    string TypeFieldLabel,
    string MoreDetailsLabel,
    string NameQuestion,
    string PublicNotice,
    string TrackingIntro,
    string? ProjectName,
    bool ShowsTypeField,
    IReadOnlyList<WidgetReportTypeViewModel> Types,
    Guid? DefaultReportType,
    ReportTitleModeEnum ReportTitleMode,
    bool AcceptsQuestionsDefault,
    ReporterIdentityModeEnum IdentityMode,
    ReportVisibilityEnum Visibility,
    bool AsksForName);

/// <summary>
/// Um tipo de relato como a ferramenta o desenha: o botao e o formulario dele.
///
/// <para><b>Sem a cor.</b> A ferramenta se pinta com o acento do cliente, e uma cor
/// por botao brigaria com ele; a cor do tipo e do painel, onde separa os cards.</para>
/// </summary>
/// <param name="PublicId">O identificador que o envio do relato manda de volta (<c>TypeId</c>).</param>
/// <param name="Name">O nome, no botao.</param>
/// <param name="Icon">O desenho, no botao.</param>
/// <param name="Questions">
/// As perguntas curtas, na ordem — cada uma vira um campo de uma linha. As respostas
/// voltam no envio na mesma ordem, uma para cada.
/// </param>
/// <param name="ShowsTextBox">Se a caixa livre aparece, depois das perguntas.</param>
/// <param name="TextBoxPrompt">O texto cinza dentro da caixa livre. Nulo quando ela nao aparece.</param>
public record WidgetReportTypeViewModel(
    Guid PublicId,
    string Name,
    ReportTypeIconEnum Icon,
    IReadOnlyList<string> Questions,
    bool ShowsTextBox,
    string? TextBoxPrompt);

/// <summary>
/// So o que o botao parado no site do cliente precisa para ser desenhado — e nada do
/// formulario.
///
/// <para><b>Existe porque o botao passou a ser desenhado pelo carregador</b>, na pagina
/// do cliente, e o formulario so e baixado no clique. Esta leitura roda em toda visita;
/// a configuracao inteira (<see cref="WidgetSettingsViewModel"/>), so quando alguem abre.
/// Os campos sao os mesmos, com o mesmo nome e os mesmos padroes, e o quadro e o
/// carregador desenham com a mesma conta.</para>
///
/// <para>Nada aqui e segredo: quem visita a pagina ve o botao, a cor e onde ele some.</para>
/// </summary>
/// <param name="IsEnabled">
/// Falso desliga o botao. <b>Projeto arquivado volta falso</b>, qualquer que seja o valor
/// salvo, como na configuracao inteira.
/// </param>
/// <param name="AccentColor">Cor do botao em <c>#rrggbb</c>. Nulo e o acento do produto.</param>
/// <param name="Position">De que canto o botao sai.</param>
/// <param name="Theme">Claro, escuro, ou o sistema de quem visita.</param>
/// <param name="OffsetX">A distancia do canto, na horizontal, em pixels.</param>
/// <param name="OffsetY">A distancia do canto, na vertical, em pixels.</param>
/// <param name="LauncherIcon">O desenho dentro do botao. <c>None</c> e so o texto.</param>
/// <param name="LauncherIconOnly">So o icone; o texto vira o nome que o leitor de tela le.</param>
/// <param name="LauncherSize">Pequeno, medio ou grande.</param>
/// <param name="LauncherShape">Pilula, arredondado ou quadrado.</param>
/// <param name="LauncherTextColor">A cor do texto sobre o botao. Nulo e automatico.</param>
/// <param name="LauncherShadow">Sombra embaixo do botao.</param>
/// <param name="MobileMode">Como o botao fica numa janela estreita.</param>
/// <param name="HiddenPaths">As paginas onde o botao nao aparece.</param>
/// <param name="LauncherLabel">O texto do botao.</param>
public record WidgetLauncherViewModel(
    bool IsEnabled,
    string? AccentColor,
    WidgetPositionEnum Position,
    WidgetThemeEnum Theme,
    int OffsetX,
    int OffsetY,
    WidgetLauncherIconEnum LauncherIcon,
    bool LauncherIconOnly,
    WidgetLauncherSizeEnum LauncherSize,
    WidgetLauncherShapeEnum LauncherShape,
    string? LauncherTextColor,
    bool LauncherShadow,
    WidgetMobileModeEnum MobileMode,
    IReadOnlyList<string> HiddenPaths,
    string LauncherLabel);
