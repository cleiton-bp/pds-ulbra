using System.Text.RegularExpressions;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Origins;
using Pds.Service.WidgetAppearance;
using Pds.Service.WidgetTexts;

namespace Pds.Service.Services;

public partial class ProjectWidgetSettingsService : IProjectWidgetSettingsService
{
    private readonly IUnitOfWork _unitOfWork;

    public ProjectWidgetSettingsService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<WidgetSettingsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var settings = await _unitOfWork.ProjectWidgetSettings.GetByProjectAsync(project.Id, cancellationToken);
        var ciclo = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);
        var identidade = await _unitOfWork.ProjectIdentitySettings.GetByProjectAsync(project.Id, cancellationToken);
        var tipos = await _unitOfWork.ProjectReportTypes.ListByProjectAsync(project.Id, cancellationToken);

        return Map(settings, ciclo, identidade, tipos, project.Name, forPanel: true);
    }

    public async Task<WidgetSettingsViewModel> ReplaceAsync(Guid projectPublicId, WidgetSettingsDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var settings = await _unitOfWork.ProjectWidgetSettings.GetByProjectAsync(project.Id, cancellationToken);

        var novo = settings is null;
        settings ??= new ProjectWidgetSettings { ProjectId = project.Id };

        settings.IsEnabled = Required(dto.IsEnabled, "Informe se a ferramenta esta ligada.");
        settings.AccentColor = NormalizeColor(dto.AccentColor, "A cor precisa estar no formato #rrggbb.");
        settings.Position = Defined(dto.Position, "Informe a posicao da ferramenta.", "Escolha um dos quatro cantos para a ferramenta.");
        settings.Theme = Required(dto.Theme, "Informe o tema da ferramenta.");
        ApplyAppearance(settings, dto);
        // Variavel so depois de enviar: na confirmacao e no topo do acompanhamento. Nos
        // outros textos ela nunca teria valor, e apareceria com as chaves no site.
        settings.LauncherLabel = Plain(dto.LauncherLabel, ProjectWidgetSettings.MaxLauncherLabelLength, "o texto do botao");
        settings.Title = Plain(dto.Title, ProjectWidgetSettings.MaxTitleLength, "o titulo do formulario");
        settings.SuccessMessage = WidgetText.WithVariables(
            RequireText(dto.SuccessMessage, ProjectWidgetSettings.MaxSuccessMessageLength, "a mensagem de confirmacao"),
            "a mensagem de confirmacao",
            WidgetText.AfterSending);
        settings.SubmitLabel = Plain(dto.SubmitLabel, ProjectWidgetSettings.MaxSubmitLabelLength, "o texto do botao de enviar");
        settings.ReportTitleQuestion = Plain(dto.ReportTitleQuestion, ProjectWidgetSettings.MaxReportTitleQuestionLength, "a pergunta do titulo");
        settings.ReportTitlePlaceholder = Plain(dto.ReportTitlePlaceholder, ProjectWidgetSettings.MaxReportTitlePlaceholderLength, "o exemplo da pergunta do titulo");
        settings.TypeFieldLabel = Plain(dto.TypeFieldLabel, ProjectWidgetSettings.MaxTypeFieldLabelLength, "o nome do seletor de tipo");
        settings.MoreDetailsLabel = Plain(dto.MoreDetailsLabel, ProjectWidgetSettings.MaxMoreDetailsLabelLength, "o nome da caixa de detalhes");
        settings.NameQuestion = Plain(dto.NameQuestion, ProjectWidgetSettings.MaxNameQuestionLength, "a pergunta do nome");
        settings.PublicNotice = Plain(dto.PublicNotice, ProjectWidgetSettings.MaxPublicNoticeLength, "o aviso de relato publico");
        settings.TrackingIntro = WidgetText.WithVariables(
            RequireText(dto.TrackingIntro, ProjectWidgetSettings.MaxTrackingIntroLength, "o texto do acompanhamento"),
            "o texto do acompanhamento",
            WidgetText.OnTracking);
        settings.ShowsTypeField = Required(dto.ShowsTypeField, "Informe se o seletor de tipo aparece.");
        settings.ReportTitleMode = Required(dto.ReportTitleMode, "Informe como a ferramenta pergunta o titulo.");

        // O pre-marcado e um dos tipos do projeto, e ativo: pre-marcar o que a
        // ferramenta nao oferece faria o seletor escondido gravar um tipo que ninguem
        // pode escolher. Nulo e o padrao, o primeiro ativo — e nao precisa conferir.
        var tipos = await _unitOfWork.ProjectReportTypes.ListByProjectAsync(project.Id, cancellationToken);
        settings.DefaultReportTypeId = RequireDefaultType(tipos, dto.DefaultReportType);

        // O numero que nao e modo nenhum passa pela leitura do JSON — e iria parar no
        // banco como texto que a ferramenta nao sabe desenhar.
        if (!Enum.IsDefined(settings.ReportTitleMode))
            throw new ArgumentException("Informe como a ferramenta pergunta o titulo: opcional, obrigatoria ou escondida.");

        if (novo)
            await _unitOfWork.ProjectWidgetSettings.AddAsync(settings, cancellationToken);
        else
            _unitOfWork.ProjectWidgetSettings.Update(settings);

        await _unitOfWork.CommitAsync(cancellationToken);

        // As regras do ciclo sao lidas e **nao** sao escritas aqui: o padrao da
        // caixa e configuracao do ciclo, e esta rota nao manda nele. Ele volta na
        // resposta so porque quem desenha a ferramenta precisa dele.
        var ciclo = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);
        var identidade = await _unitOfWork.ProjectIdentitySettings.GetByProjectAsync(project.Id, cancellationToken);

        return Map(settings, ciclo, identidade, tipos, project.Name, forPanel: true);
    }

    public async Task<WidgetSettingsViewModel> GetByPublicKeyAsync(string? key, string? origin, CancellationToken cancellationToken = default)
    {
        var project = await RequirePublicProjectAsync(key, origin, cancellationToken);

        var settings = await _unitOfWork.ProjectWidgetSettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        // Sem sessao aqui tambem: a lista de projetos acessiveis esta vazia, e o filtro global devolveria
        // vazio sem erro nenhum — a caixa apareceria marcada num projeto que a
        // configurou desmarcada, e nada acusaria.
        var ciclo = await _unitOfWork.ProjectCycleSettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        // E a identidade, pelo mesmo motivo: e o modo que decide se a ferramenta
        // guarda um codigo e oferece "os meus relatos", ou se cada relato sai como
        // um link solto.
        var identidade = await _unitOfWork.ProjectIdentitySettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        // E os tipos, pelo mesmo motivo: sao os botoes e as perguntas do formulario.
        // Sem sessao, a lista voltaria vazia e a ferramenta abriria sem ter o que
        // perguntar.
        var tipos = await _unitOfWork.ProjectReportTypes
            .ListByProjectWithoutSessionAsync(project.Id, cancellationToken);

        var view = Map(settings, ciclo, identidade, tipos, project.Name);

        // Projeto arquivado nao aceita relato novo: a criacao responde 403. Deixar a
        // ferramenta abrir levaria a pessoa a escrever ate o fim para ser recusada no
        // envio — e o texto dela seria perdido por uma decisao que nao e dela.
        return project.Status == ProjectStatusEnum.Archived
            ? view with { IsEnabled = false }
            : view;
    }

    public async Task<WidgetLauncherViewModel> GetLauncherByPublicKeyAsync(string? key, string? origin, CancellationToken cancellationToken = default)
    {
        // As mesmas duas recusas da configuracao inteira, e na mesma ordem: o botao
        // que aparece onde o quadro recusaria abrir seria um convite para nada.
        var project = await RequirePublicProjectAsync(key, origin, cancellationToken);

        // So a tabela da ferramenta. As outras tres (ciclo, identidade, tipos) sao do
        // formulario, e o botao nao precisa delas: esta leitura roda em toda visita
        // ao site do cliente, e a do formulario so no clique.
        var settings = await _unitOfWork.ProjectWidgetSettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        return new WidgetLauncherViewModel(
            // Arquivado, desligado — pelo mesmo motivo da configuracao inteira.
            project.Status != ProjectStatusEnum.Archived && (settings?.IsEnabled ?? WidgetSettingsDefaults.IsEnabled),
            settings is null ? WidgetSettingsDefaults.AccentColor : settings.AccentColor,
            settings?.Position ?? WidgetSettingsDefaults.Position,
            settings?.Theme ?? WidgetSettingsDefaults.Theme,
            settings?.OffsetX ?? WidgetSettingsDefaults.OffsetX,
            settings?.OffsetY ?? WidgetSettingsDefaults.OffsetY,
            settings?.LauncherIcon ?? WidgetSettingsDefaults.LauncherIcon,
            settings?.LauncherIconOnly ?? WidgetSettingsDefaults.LauncherIconOnly,
            settings?.LauncherSize ?? WidgetSettingsDefaults.LauncherSize,
            settings?.LauncherShape ?? WidgetSettingsDefaults.LauncherShape,
            settings is null ? WidgetSettingsDefaults.LauncherTextColor : settings.LauncherTextColor,
            settings?.LauncherShadow ?? WidgetSettingsDefaults.LauncherShadow,
            settings?.MobileMode ?? WidgetSettingsDefaults.MobileMode,
            settings?.HiddenPaths ?? WidgetSettingsDefaults.HiddenPaths,
            settings?.LauncherLabel ?? WidgetSettingsDefaults.LauncherLabel);
    }

    /// <summary>
    /// O projeto dono da chave publica, se a ferramenta pode abrir no endereco
    /// declarado. <b>Uma porta so para as duas leituras publicas da ferramenta</b> — a
    /// do botao e a do formulario —, para elas nunca discordarem sobre quem passa.
    /// </summary>
    private async Task<Project> RequirePublicProjectAsync(string? key, string? origin, CancellationToken cancellationToken)
    {
        var value = (key ?? string.Empty).Trim();

        // Chave ausente, desconhecida, revogada ou secreta recebem a mesma recusa,
        // com a mesma mensagem — a mesma regra da rota que recebe o relato.
        var found = value.Length > 0
            ? await _unitOfWork.ProjectKeys.FindActivePublicAsync(value, cancellationToken)
            : null;

        if (found is null)
            throw new UnauthorizedAccessException("Chave publica invalida.");

        var project = found.Project;

        // O endereco bloqueado: a ferramenta nao abre ali. Recusar aqui, e nao so no
        // envio, e o que faz o quadro nunca aparecer no site bloqueado — em vez de
        // aparecer, receber o texto e recusar no fim. O endereco fora da lista de
        // autorizados **abre**: o relato dele e recebido e fica retido ate o time
        // decidir, e e assim que o time fica sabendo que o endereco existe.
        await OriginGate.EnsureNotBlockedAsync(_unitOfWork, project.Id, origin, cancellationToken);

        return project;
    }

    private async Task<Project> RequireOwnProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    /// <summary>
    /// A linha do banco, ou os padroes quando ela nao existe. Quem le a resposta nao
    /// precisa saber qual dos dois casos aconteceu — e nao deve: um dia a linha
    /// passa a existir para todo mundo e nada muda para quem consome.
    /// </summary>
    /// <param name="cycle">
    /// As regras do ciclo, so para o padrao da caixa "aceito responder duvidas".
    /// <b>Vem de outra tabela de proposito</b>: o valor mora onde a resposta
    /// significa alguma coisa, e quem precisa dele para desenhar e o quadro.
    /// </param>
    /// <param name="identity">
    /// A identidade, so para o modo. <b>Terceira tabela, e pelo mesmo criterio</b>:
    /// cada valor mora onde ele significa alguma coisa, e esta resposta e a costura
    /// de tudo que o quadro precisa para aparecer.
    /// </param>
    /// <param name="types">
    /// Os tipos do projeto, na ordem, desativados inclusive — saem so os ativos. A
    /// quarta tabela: os tipos sao do projeto, e o formulario de cada um e parte do que
    /// o quadro desenha.
    /// </param>
    /// <param name="projectName">
    /// O nome do projeto, para <c>{{projeto}}</c>. Sai para o painel sempre, e para o
    /// site do cliente so quando a confirmacao usa a variavel: e nome interno.
    /// </param>
    private static WidgetSettingsViewModel Map(
        ProjectWidgetSettings? settings,
        ProjectCycleSettings? cycle,
        ProjectIdentitySettings? identity,
        IReadOnlyList<ProjectReportType> types,
        string projectName,
        bool forPanel = false)
    {
        var sucesso = settings?.SuccessMessage ?? WidgetSettingsDefaults.SuccessMessage;

        var ativos = types.Where(type => type.IsActive).ToList();

        // O escolhido, se ainda e oferecido; senao o primeiro ativo. O desativado nao e
        // erro de configuracao: desativar e decisao de outra tela, e esta nao pode
        // passar a pre-marcar o que a ferramenta nao mostra.
        //
        // **O painel recebe a escolha, e nao o resultado**: nulo quando ninguem escolheu
        // (ou o escolhido foi desativado). Devolver o primeiro ativo ja resolvido faria a
        // tela nao distinguir "o primeiro da lista" de "este tipo" — e salvar qualquer
        // outro campo prenderia o primeiro de hoje, que deixaria de acompanhar a ordem.
        var escolhido = ativos.FirstOrDefault(type => type.Id == settings?.DefaultReportTypeId);
        var preMarcado = forPanel ? escolhido : escolhido ?? ativos.FirstOrDefault();

        return new WidgetSettingsViewModel(
            settings?.IsEnabled ?? WidgetSettingsDefaults.IsEnabled,
            settings is null ? WidgetSettingsDefaults.AccentColor : settings.AccentColor,
            settings?.Position ?? WidgetSettingsDefaults.Position,
            settings?.Theme ?? WidgetSettingsDefaults.Theme,
            settings?.OffsetX ?? WidgetSettingsDefaults.OffsetX,
            settings?.OffsetY ?? WidgetSettingsDefaults.OffsetY,
            settings?.LauncherIcon ?? WidgetSettingsDefaults.LauncherIcon,
            settings?.LauncherIconOnly ?? WidgetSettingsDefaults.LauncherIconOnly,
            settings?.LauncherSize ?? WidgetSettingsDefaults.LauncherSize,
            settings?.LauncherShape ?? WidgetSettingsDefaults.LauncherShape,
            settings is null ? WidgetSettingsDefaults.LauncherTextColor : settings.LauncherTextColor,
            settings?.LauncherShadow ?? WidgetSettingsDefaults.LauncherShadow,
            settings?.MobileMode ?? WidgetSettingsDefaults.MobileMode,
            settings?.HiddenPaths ?? WidgetSettingsDefaults.HiddenPaths,
            settings?.LauncherLabel ?? WidgetSettingsDefaults.LauncherLabel,
            settings?.Title ?? WidgetSettingsDefaults.Title,
            sucesso,
            settings?.SubmitLabel ?? WidgetSettingsDefaults.SubmitLabel,
            settings?.ReportTitleQuestion ?? WidgetSettingsDefaults.ReportTitleQuestion,
            settings?.ReportTitlePlaceholder ?? WidgetSettingsDefaults.ReportTitlePlaceholder,
            settings?.TypeFieldLabel ?? WidgetSettingsDefaults.TypeFieldLabel,
            settings?.MoreDetailsLabel ?? WidgetSettingsDefaults.MoreDetailsLabel,
            settings?.NameQuestion ?? WidgetSettingsDefaults.NameQuestion,
            settings?.PublicNotice ?? WidgetSettingsDefaults.PublicNotice,
            settings?.TrackingIntro ?? WidgetSettingsDefaults.TrackingIntro,
            forPanel || WidgetText.Uses(sucesso, WidgetText.Project) ? projectName : null,
            settings?.ShowsTypeField ?? WidgetSettingsDefaults.ShowsTypeField,
            ativos
                .Select(type => new WidgetReportTypeViewModel(
                    type.PublicId,
                    type.Name,
                    type.Icon,
                    type.Questions,
                    type.ShowsTextBox,
                    // O texto guardado com a caixa escondida nao sai: e da tela de
                    // configuracao, e nao do formulario.
                    type.ShowsTextBox ? type.TextBoxPrompt : null))
                .ToList(),
            preMarcado?.PublicId,
            settings?.ReportTitleMode ?? WidgetSettingsDefaults.ReportTitleMode,
            cycle?.AcceptsQuestionsDefault ?? CycleSettingsDefaults.AcceptsQuestionsDefault,
            identity?.Mode ?? IdentitySettingsDefaults.Mode,
            identity?.Visibility ?? IdentitySettingsDefaults.Visibility,
            identity?.AsksForName ?? IdentitySettingsDefaults.AsksForName);
    }

    /// <summary>
    /// O tipo pre-marcado escolhido: nulo e o padrao (o primeiro ativo); o escolhido tem
    /// de ser deste projeto e estar ativo.
    /// </summary>
    private static long? RequireDefaultType(IReadOnlyList<ProjectReportType> types, Guid? publicId)
    {
        if (publicId is not Guid escolhido)
            return null;

        var tipo = types.FirstOrDefault(type => type.PublicId == escolhido)
                   ?? throw new KeyNotFoundException("Tipo de relato nao encontrado neste projeto.");

        if (!tipo.IsActive)
            throw new ConflictException("Este tipo de relato foi desativado e nao aparece na ferramenta. Escolha um tipo ativo.");

        return tipo.Id;
    }

    private static T Required<T>(T? value, string message) where T : struct
        => value ?? throw new ArgumentException(message);

    /// <summary>
    /// Obrigatorio, e um dos valores da lista: o numero que nao e valor nenhum passa
    /// pela leitura do JSON e iria parar no banco como texto que a ferramenta nao sabe
    /// desenhar.
    /// </summary>
    private static T Defined<T>(T? value, string missing, string invalid) where T : struct, Enum
    {
        var valor = Required(value, missing);

        if (!Enum.IsDefined(valor))
            throw new ArgumentException(invalid);

        return valor;
    }

    /// <summary>
    /// A aparencia do botao. Cada campo tem o seu padrao de fabrica, e o projeto que
    /// nunca mexeu continua com o botao de sempre — mas a gravacao manda todos, como o
    /// resto desta rota.
    /// </summary>
    private static void ApplyAppearance(ProjectWidgetSettings settings, WidgetSettingsDto dto)
    {
        settings.OffsetX = Offset(dto.OffsetX);
        settings.OffsetY = Offset(dto.OffsetY);
        settings.LauncherIcon = Defined(dto.LauncherIcon, "Informe o icone do botao.", "Escolha um icone da lista, ou nenhum.");
        settings.LauncherIconOnly = Required(dto.LauncherIconOnly, "Informe se o botao mostra so o icone.");
        settings.LauncherSize = Defined(dto.LauncherSize, "Informe o tamanho do botao.", "Escolha o tamanho do botao: pequeno, medio ou grande.");
        settings.LauncherShape = Defined(dto.LauncherShape, "Informe o formato do botao.", "Escolha o formato do botao: pilula, arredondado ou quadrado.");
        // A cor escolhida vale mesmo com pouco contraste: a marca do cliente pode pedir
        // o branco que a conta nao escolheria. Quem avisa e o painel, antes de salvar.
        settings.LauncherTextColor = NormalizeColor(dto.LauncherTextColor, "A cor do texto do botao precisa estar no formato #rrggbb.");
        settings.LauncherShadow = Required(dto.LauncherShadow, "Informe se o botao tem sombra.");
        settings.MobileMode = Defined(dto.MobileMode, "Informe como o botao fica no celular.", "Escolha como o botao fica no celular: igual, so o icone ou escondido.");
        settings.HiddenPaths = HiddenPages.Normalize(dto.HiddenPaths);

        // Recusar, e nao escolher um icone pelo cliente: o painel ja escolhe um quando
        // a pessoa marca "so o icone", e a API que inventasse um desenho gravaria uma
        // aparencia que ninguem viu na previa.
        var pedeIcone = settings.LauncherIconOnly || settings.MobileMode == WidgetMobileModeEnum.IconOnly;
        if (pedeIcone && settings.LauncherIcon == WidgetLauncherIconEnum.None)
            throw new ArgumentException("Para mostrar so o icone, escolha um icone para o botao.");
    }

    private static int Offset(int? value)
    {
        var distancia = Required(value, "Informe a distancia do canto.");

        if (distancia < ProjectWidgetSettings.MinOffset || distancia > ProjectWidgetSettings.MaxOffset)
            throw new ArgumentException($"A distancia do canto vai de {ProjectWidgetSettings.MinOffset} a {ProjectWidgetSettings.MaxOffset} pixels.");

        return distancia;
    }

    /// <summary>Um texto obrigatorio, com teto, e sem variavel.</summary>
    private static string Plain(string? value, int maxLength, string what)
        => WidgetText.WithoutVariables(RequireText(value, maxLength, what), what);

    private static string RequireText(string? value, int maxLength, string what)
    {
        var text = (value ?? string.Empty).Trim();

        if (text.Length == 0)
            throw new ArgumentException($"Escreva {what}.");

        if (text.Length > maxLength)
            throw new ArgumentException($"O campo com {what} pode ter ate {maxLength} caracteres.");

        return text;
    }

    /// <summary>
    /// A cor vira <c>#rrggbb</c> minusculo, e a forma curta e expandida — a do botao e
    /// a do texto por cima dele.
    ///
    /// <para>Guardar as duas formas faria a mesma cor existir de dois jeitos no
    /// banco, e uma consulta por igualdade passaria a mentir. Cor que nao e cor e
    /// recusada aqui: o quadro ja sabe cair no acento do produto, mas deixar passar
    /// significaria a tela mostrar salvo um valor que nunca vai aparecer.</para>
    /// </summary>
    private static string? NormalizeColor(string? value, string invalid)
    {
        var text = (value ?? string.Empty).Trim().ToLowerInvariant();

        if (text.Length == 0)
            return null;

        if (!HexColor().IsMatch(text))
            throw new ArgumentException(invalid);

        return text.Length == 4
            ? $"#{text[1]}{text[1]}{text[2]}{text[2]}{text[3]}{text[3]}"
            : text;
    }

    [GeneratedRegex("^#(?:[0-9a-f]{3}|[0-9a-f]{6})$")]
    private static partial Regex HexColor();
}
