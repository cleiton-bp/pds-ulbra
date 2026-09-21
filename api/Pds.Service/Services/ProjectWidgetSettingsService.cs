using System.Text.RegularExpressions;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Origins;

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

        return Map(settings, ciclo, identidade);
    }

    public async Task<WidgetSettingsViewModel> ReplaceAsync(Guid projectPublicId, WidgetSettingsDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var settings = await _unitOfWork.ProjectWidgetSettings.GetByProjectAsync(project.Id, cancellationToken);

        var novo = settings is null;
        settings ??= new ProjectWidgetSettings { ProjectId = project.Id };

        settings.IsEnabled = Required(dto.IsEnabled, "Informe se a ferramenta esta ligada.");
        settings.AccentColor = NormalizeAccent(dto.AccentColor);
        settings.Position = Required(dto.Position, "Informe a posicao da ferramenta.");
        settings.Theme = Required(dto.Theme, "Informe o tema da ferramenta.");
        settings.LauncherLabel = RequireText(dto.LauncherLabel, ProjectWidgetSettings.MaxLauncherLabelLength, "o texto do botao");
        settings.Title = RequireText(dto.Title, ProjectWidgetSettings.MaxTitleLength, "o título do formulário");
        settings.Placeholder = RequireText(dto.Placeholder, ProjectWidgetSettings.MaxPlaceholderLength, "o texto da caixa vazia");
        settings.SuccessMessage = RequireText(dto.SuccessMessage, ProjectWidgetSettings.MaxSuccessMessageLength, "a mensagem de confirmação");
        settings.ShowsTypeField = Required(dto.ShowsTypeField, "Informe se o seletor de tipo aparece.");
        settings.DefaultReportType = Required(dto.DefaultReportType, "Informe o tipo pre-marcado.");

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

        return Map(settings, ciclo, identidade);
    }

    public async Task<WidgetSettingsViewModel> GetByPublicKeyAsync(string? key, string? origin, CancellationToken cancellationToken = default)
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

        // Endereco declarado fora da lista do projeto: a ferramenta nao abre ali.
        // Recusar aqui, e nao so no envio, e o que faz o quadro nunca aparecer no
        // site errado — em vez de aparecer, receber o texto e recusar no fim.
        if (OriginAllowList.Declares(origin))
        {
            var origins = await _unitOfWork.ProjectOrigins.ListByProjectWithoutSessionAsync(project.Id, cancellationToken);

            if (!OriginAllowList.Allows(origins, origin))
                throw new ForbiddenException("Este endereco nao esta autorizado a abrir a ferramenta deste projeto.");
        }

        var settings = await _unitOfWork.ProjectWidgetSettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        // Sem sessao aqui tambem: a conta atual e zero, e o filtro global devolveria
        // vazio sem erro nenhum — a caixa apareceria marcada num projeto que a
        // configurou desmarcada, e nada acusaria.
        var ciclo = await _unitOfWork.ProjectCycleSettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        // E a identidade, pelo mesmo motivo: e o modo que decide se a ferramenta
        // guarda um codigo e oferece "os meus relatos", ou se cada relato sai como
        // um link solto.
        var identidade = await _unitOfWork.ProjectIdentitySettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        var view = Map(settings, ciclo, identidade);

        // Projeto arquivado nao aceita relato novo: a criacao responde 403. Deixar a
        // ferramenta abrir levaria a pessoa a escrever ate o fim para ser recusada no
        // envio — e o texto dela seria perdido por uma decisao que nao e dela.
        return project.Status == ProjectStatusEnum.Archived
            ? view with { IsEnabled = false }
            : view;
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
    private static WidgetSettingsViewModel Map(
        ProjectWidgetSettings? settings,
        ProjectCycleSettings? cycle,
        ProjectIdentitySettings? identity) => new(
        settings?.IsEnabled ?? WidgetSettingsDefaults.IsEnabled,
        settings is null ? WidgetSettingsDefaults.AccentColor : settings.AccentColor,
        settings?.Position ?? WidgetSettingsDefaults.Position,
        settings?.Theme ?? WidgetSettingsDefaults.Theme,
        settings?.LauncherLabel ?? WidgetSettingsDefaults.LauncherLabel,
        settings?.Title ?? WidgetSettingsDefaults.Title,
        settings?.Placeholder ?? WidgetSettingsDefaults.Placeholder,
        settings?.SuccessMessage ?? WidgetSettingsDefaults.SuccessMessage,
        settings?.ShowsTypeField ?? WidgetSettingsDefaults.ShowsTypeField,
        settings?.DefaultReportType ?? WidgetSettingsDefaults.DefaultReportType,
        cycle?.AcceptsQuestionsDefault ?? CycleSettingsDefaults.AcceptsQuestionsDefault,
        identity?.Mode ?? IdentitySettingsDefaults.Mode,
        identity?.Visibility ?? IdentitySettingsDefaults.Visibility,
        identity?.AsksForName ?? IdentitySettingsDefaults.AsksForName);

    private static T Required<T>(T? value, string message) where T : struct
        => value ?? throw new ArgumentException(message);

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
    /// A cor vira <c>#rrggbb</c> minusculo, e a forma curta e expandida.
    ///
    /// <para>Guardar as duas formas faria a mesma cor existir de dois jeitos no
    /// banco, e uma consulta por igualdade passaria a mentir. Cor que nao e cor e
    /// recusada aqui: o quadro ja sabe cair no acento do produto, mas deixar passar
    /// significaria a tela mostrar salvo um valor que nunca vai aparecer.</para>
    /// </summary>
    private static string? NormalizeAccent(string? value)
    {
        var text = (value ?? string.Empty).Trim().ToLowerInvariant();

        if (text.Length == 0)
            return null;

        if (!HexColor().IsMatch(text))
            throw new ArgumentException("A cor precisa estar no formato #rrggbb.");

        return text.Length == 4
            ? $"#{text[1]}{text[1]}{text[2]}{text[2]}{text[3]}{text[3]}"
            : text;
    }

    [GeneratedRegex("^#(?:[0-9a-f]{3}|[0-9a-f]{6})$")]
    private static partial Regex HexColor();
}
