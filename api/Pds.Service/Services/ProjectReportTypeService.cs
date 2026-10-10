using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Cards;

namespace Pds.Service.Services;

/// <summary>
/// Os tipos de relato de um projeto, como as prioridades: criar, mudar, reordenar,
/// desativar e reativar.
///
/// <para><b>Nao existe apagar</b>, so desativar: relato antigo aponta para o tipo, e o
/// card precisa continuar dizendo o que ele e.</para>
///
/// <para><b>Ao menos um ativo, e no maximo <see cref="ProjectReportType.MaxActive"/></b>.
/// Sem tipo ativo, a ferramenta nao teria o que oferecer, e o relato nao teria como
/// entrar; com tipos demais, o seletor vira lista para ler. As duas regras sao
/// conferidas aqui, a cada mudanca que mexe na contagem.</para>
///
/// <para><b>Sem <c>Update</c> em lugar nenhum</b>, como nas prioridades: as linhas ja
/// sao rastreadas, e a gravacao leva so o que mudou.</para>
/// </summary>
public class ProjectReportTypeService : IProjectReportTypeService
{
    private const string Que = "o tipo de relato";

    private readonly IUnitOfWork _unitOfWork;

    /// <summary>
    /// A tela de Trabalho dos outros le esta configuracao — o filtro de tipo e o
    /// desenho de cada card: mudou, ela rele. Ver <see cref="IWorkNotifier"/>.
    /// </summary>
    private readonly IWorkNotifier _notifier;

    public ProjectReportTypeService(IUnitOfWork unitOfWork, IWorkNotifier notifier)
    {
        _notifier = notifier;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<ProjectReportTypeViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var types = await _unitOfWork.ProjectReportTypes.ListByProjectAsync(project.Id, cancellationToken);

        return await MapAllAsync(project.Id, types, cancellationToken);
    }

    public async Task<ProjectReportTypeViewModel> CreateAsync(Guid projectPublicId, CreateProjectReportTypeDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var form = await ReadFormAsync(project.Id, dto.Name, dto.Color, dto.Icon, dto.Questions, dto.ShowsTextBox, dto.TextBoxPrompt,
            dto.InitialStatePublicId, null, cancellationToken);

        if (await _unitOfWork.ProjectReportTypes.NameExistsAsync(project.Id, form.Name, cancellationToken: cancellationToken))
            throw new ConflictException("Este projeto ja tem um tipo de relato com este nome.");

        var type = await _unitOfWork.InTransactionAsync(async ct =>
        {
            // A contagem e a gravacao sob a mesma trava: duas criacoes juntas no nono
            // ativo veriam as duas uma vaga, e o projeto ficaria com onze.
            await _unitOfWork.ProjectReportTypes.LockActiveCountAsync(project.Id, ct);

            // O novo entra ativo, e por isso conta no teto: criar o decimo primeiro seria
            // desativar um pela porta dos fundos, porque a ferramenta nao teria onde po-lo.
            if (await _unitOfWork.ProjectReportTypes.CountActiveAsync(project.Id, ct) >= ProjectReportType.MaxActive)
            {
                throw new ConflictException(
                    $"Este projeto ja tem {ProjectReportType.MaxActive} tipos de relato ativos. Desative um antes de criar outro.");
            }

            var last = await _unitOfWork.ProjectReportTypes.LastPositionAsync(project.Id, ct);

            var novo = new ProjectReportType
            {
                ProjectId = project.Id,
                // No fim da lista: o tipo novo e o caso menos comum de quem relata, e a ordem
                // se ajusta arrastando. Ir para o comeco mudaria o pre-marcado de quem nao
                // escolheu nenhum.
                Position = last + 1 ?? 0,
            };
            Apply(novo, form);

            await _unitOfWork.ProjectReportTypes.AddAsync(novo, ct);
            await _unitOfWork.CommitAsync(ct);
            return novo;
        }, cancellationToken);

        await _notifier.ProjectChangedAsync(projectPublicId);

        return Map(type, form.InitialStatePublicId);
    }

    public async Task<ProjectReportTypeViewModel> UpdateAsync(Guid projectPublicId, Guid typePublicId, UpdateProjectReportTypeDto dto, CancellationToken cancellationToken = default)
    {
        var (project, type) = await RequireTypeAsync(projectPublicId, typePublicId, cancellationToken);
        var form = await ReadFormAsync(project.Id, dto.Name, dto.Color, dto.Icon, dto.Questions, dto.ShowsTextBox, dto.TextBoxPrompt,
            dto.InitialStatePublicId, type.InitialStateId, cancellationToken);

        // A excecao e o proprio tipo: corrigir um acento nao pode esbarrar nele.
        if (await _unitOfWork.ProjectReportTypes.NameExistsAsync(type.ProjectId, form.Name, type.Id, cancellationToken))
            throw new ConflictException("Este projeto ja tem um tipo de relato com este nome.");

        Apply(type, form);
        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.ProjectChangedAsync(projectPublicId);

        return Map(type, form.InitialStatePublicId);
    }

    public async Task<IReadOnlyList<ProjectReportTypeViewModel>> ReorderAsync(Guid projectPublicId, ReorderProjectReportTypesDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var types = await _unitOfWork.ProjectReportTypes.ListByProjectAsync(project.Id, cancellationToken);

        var order = dto.Order ?? [];
        var byPublicId = types.ToDictionary(type => type.PublicId);

        // A lista inteira, uma vez cada — como na ordem das prioridades, e pelo mesmo
        // motivo: uma lista parcial nao diria onde fica o que ficou de fora.
        if (order.Count != types.Count
            || order.Distinct().Count() != order.Count
            || order.Any(publicId => !byPublicId.ContainsKey(publicId)))
        {
            throw new ArgumentException("A ordem precisa trazer todos os tipos de relato deste projeto, uma vez cada.");
        }

        for (var position = 0; position < order.Count; position++)
            byPublicId[order[position]].Position = position;

        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.ProjectChangedAsync(projectPublicId);

        var colunas = await StatePublicIdsAsync(project.Id, cancellationToken);
        return order.Select(publicId => Map(byPublicId[publicId], colunas)).ToList();
    }

    /// <summary>
    /// Desativa: o tipo continua nos relatos que ja o tem e sai da ferramenta e da
    /// escolha. Desativar o que ja esta desativado nao e erro.
    ///
    /// <para><b>O ultimo ativo nao se desativa.</b> A ferramenta ficaria sem tipo para
    /// oferecer, e o relato sem como entrar — e quem descobriria seria quem relata, no
    /// site do cliente.</para>
    /// </summary>
    public async Task<ProjectReportTypeViewModel> DeactivateAsync(Guid projectPublicId, Guid typePublicId, CancellationToken cancellationToken = default)
    {
        var (project, type) = await RequireTypeAsync(projectPublicId, typePublicId, cancellationToken);

        if (type.IsActive)
        {
            // Contar e gravar sob a trava: desativar os dois ultimos ativos ao mesmo
            // tempo veria "dois" nas duas, e o projeto ficaria sem nenhum. Quem espera
            // conta depois de o outro gravar, e e recusado.
            await _unitOfWork.InTransactionAsync(async ct =>
            {
                await _unitOfWork.ProjectReportTypes.LockActiveCountAsync(project.Id, ct);

                if (await _unitOfWork.ProjectReportTypes.CountActiveAsync(project.Id, ct) <= 1)
                {
                    throw new ConflictException(
                        "Nao da para desativar o unico tipo de relato ativo do projeto: a ferramenta precisa de ao menos um. Crie ou reative outro antes.");
                }

                type.DeactivatedAt = DateTime.UtcNow;
                await _unitOfWork.CommitAsync(ct);
                return true;
            }, cancellationToken);

            await _notifier.ProjectChangedAsync(projectPublicId);
        }

        return Map(type, await StatePublicIdsAsync(project.Id, cancellationToken));
    }

    public async Task<ProjectReportTypeViewModel> ActivateAsync(Guid projectPublicId, Guid typePublicId, CancellationToken cancellationToken = default)
    {
        var (project, type) = await RequireTypeAsync(projectPublicId, typePublicId, cancellationToken);

        // O nome repetido e barrado entre todos, desativados inclusive: voltar nunca
        // colide. O teto, sim — e a mensagem diz a saida.
        if (!type.IsActive)
        {
            // A mesma trava da criacao e da desativacao: duas reativacoes juntas no nono
            // ativo passariam as duas.
            await _unitOfWork.InTransactionAsync(async ct =>
            {
                await _unitOfWork.ProjectReportTypes.LockActiveCountAsync(project.Id, ct);

                if (await _unitOfWork.ProjectReportTypes.CountActiveAsync(project.Id, ct) >= ProjectReportType.MaxActive)
                {
                    throw new ConflictException(
                        $"Este projeto ja tem {ProjectReportType.MaxActive} tipos de relato ativos. Desative um antes de reativar outro.");
                }

                type.DeactivatedAt = null;
                await _unitOfWork.CommitAsync(ct);
                return true;
            }, cancellationToken);

            await _notifier.ProjectChangedAsync(projectPublicId);
        }

        return Map(type, await StatePublicIdsAsync(project.Id, cancellationToken));
    }

    /// <summary>
    /// O formulario do tipo, conferido inteiro antes de tocar na linha: ou tudo vale, ou
    /// nada muda.
    /// </summary>
    /// <param name="currentStateId">
    /// A coluna que o tipo ja tem, para a edicao. Manter a mesma nao e escolher de novo:
    /// a regra de aposentar ja garante que ela continua ativa.
    /// </param>
    private async Task<TypeForm> ReadFormAsync(
        long projectId,
        string? name,
        CardColorEnum? color,
        ReportTypeIconEnum? icon,
        List<string?>? questions,
        bool? showsTextBox,
        string? textBoxPrompt,
        Guid? initialStatePublicId,
        long? currentStateId,
        CancellationToken cancellationToken)
    {
        var nome = CardText.Name(name, ProjectReportType.MaxNameLength, Que);
        var cor = RequireColor(color);
        var desenho = RequireIcon(icon);
        var perguntas = NormalizeQuestions(questions);
        var caixa = showsTextBox ?? throw new ArgumentException("Informe se a caixa de texto livre aparece.");
        var texto = NormalizePrompt(textBoxPrompt, caixa);

        // O tipo sempre pede alguma coisa: sem pergunta e sem caixa, a pessoa abriria o
        // formulario e nao teria onde escrever. O banco tem a mesma regra; aqui ela vira
        // uma frase que diz o que fazer.
        if (!caixa && perguntas.Count == 0)
            throw new ArgumentException("O tipo de relato precisa pedir alguma coisa: escreva ao menos uma pergunta, ou mostre a caixa de texto livre.");

        var (estadoId, estadoPublicId) = await ResolveInitialStateAsync(projectId, initialStatePublicId, currentStateId, cancellationToken);

        return new TypeForm(nome, cor, desenho, perguntas, caixa, texto, estadoId, estadoPublicId);
    }

    private static void Apply(ProjectReportType type, TypeForm form)
    {
        type.Name = form.Name;
        type.Color = form.Color;
        type.Icon = form.Icon;
        type.Questions = [.. form.Questions];
        type.ShowsTextBox = form.ShowsTextBox;
        type.TextBoxPrompt = form.TextBoxPrompt;
        type.InitialStateId = form.InitialStateId;
    }

    /// <summary>
    /// As perguntas arrumadas: cada uma numa linha, sem as bordas e sem os espacos
    /// repetidos, como o nome; a que veio em branco e descartada — e o campo que a tela
    /// acabou de abrir e ninguem preencheu, e recusar por ele seria cobrar a tela.
    /// </summary>
    private static List<string> NormalizeQuestions(List<string?>? questions)
    {
        var perguntas = (questions ?? [])
            .Select(CardText.Line)
            .OfType<string>()
            .ToList();

        if (perguntas.Count > ProjectReportType.MaxQuestions)
            throw new ArgumentException($"Um tipo de relato faz no maximo {ProjectReportType.MaxQuestions} perguntas.");

        if (perguntas.Any(pergunta => pergunta.Length > ProjectReportType.MaxQuestionLength))
            throw new ArgumentException($"Cada pergunta pode ter ate {ProjectReportType.MaxQuestionLength} caracteres.");

        // A mesma pergunta duas vezes faria a pessoa responder duas vezes, e o relato
        // guardaria duas respostas para a mesma pergunta.
        if (perguntas.Distinct(StringComparer.OrdinalIgnoreCase).Count() != perguntas.Count)
            throw new ArgumentException("As perguntas de um tipo de relato nao podem se repetir.");

        return perguntas;
    }

    /// <summary>
    /// O texto da caixa. Obrigatorio com ela a mostra; com ela escondida, o que veio e
    /// guardado assim mesmo, para voltar igual quando ela for ligada de novo.
    /// </summary>
    private static string? NormalizePrompt(string? value, bool showsTextBox)
    {
        var texto = CardText.Line(value);

        if (texto is null && showsTextBox)
            throw new ArgumentException("Escreva o texto que aparece dentro da caixa de texto livre.");

        if (texto is not null && texto.Length > ProjectReportType.MaxTextBoxPromptLength)
            throw new ArgumentException($"O texto da caixa de texto livre pode ter ate {ProjectReportType.MaxTextBoxPromptLength} caracteres.");

        return texto;
    }

    /// <summary>
    /// A coluna de entrada. Nula e o padrao — a primeira coluna ativa —, e nao precisa
    /// de conferencia nenhuma. A escolhida tem de ser deste projeto e estar ativa:
    /// mandar relato novo para uma coluna aposentada seria desfazer pela porta dos
    /// fundos o que aposentar decidiu.
    /// </summary>
    private async Task<(long? Id, Guid? PublicId)> ResolveInitialStateAsync(
        long projectId,
        Guid? statePublicId,
        long? currentStateId,
        CancellationToken cancellationToken)
    {
        if (statePublicId is not Guid publicId)
            return (null, null);

        var state = await _unitOfWork.ProjectStates.GetByPublicIdAsync(publicId, cancellationToken);

        if (state is null || state.ProjectId != projectId)
            throw new KeyNotFoundException("Estado nao encontrado neste projeto.");

        if (!state.IsActive && state.Id != currentStateId)
            throw new ConflictException("Este estado esta aposentado e nao recebe relato novo.");

        return (state.Id, state.PublicId);
    }

    private static CardColorEnum RequireColor(CardColorEnum? color)
    {
        var cor = color ?? throw new ArgumentException("Escolha a cor do tipo de relato.");

        // O numero que nao e cor nenhuma passa pela leitura do JSON — e iria parar no
        // banco como texto que ninguem sabe desenhar.
        if (!Enum.IsDefined(cor))
            throw new ArgumentException("Escolha uma cor da paleta.");

        return cor;
    }

    private static ReportTypeIconEnum RequireIcon(ReportTypeIconEnum? icon)
    {
        var desenho = icon ?? throw new ArgumentException("Escolha o desenho do tipo de relato.");

        // O mesmo cuidado da cor: o numero solto passa pelo JSON.
        if (!Enum.IsDefined(desenho))
            throw new ArgumentException("Escolha um desenho da lista.");

        return desenho;
    }

    private async Task<(Project Project, ProjectReportType Type)> RequireTypeAsync(Guid projectPublicId, Guid typePublicId, CancellationToken cancellationToken)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var type = await _unitOfWork.ProjectReportTypes.GetByPublicIdAsync(typePublicId, cancellationToken);

        // O filtro global garante que e de um projeto que a pessoa enxerga, e nao que
        // e deste — como na prioridade. Sem esta conferencia, quem administra aqui e so
        // membro la mudaria a configuracao de la.
        if (type is null || type.ProjectId != project.Id)
            throw new KeyNotFoundException("Tipo de relato nao encontrado neste projeto.");

        return (project, type);
    }

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    /// <summary>
    /// Os identificadores publicos das colunas do projeto, para dizer a coluna de cada
    /// tipo sem uma consulta por tipo. As aposentadas entram: a lista e de traducao, e
    /// nao de escolha.
    /// </summary>
    private async Task<IReadOnlyDictionary<long, Guid>> StatePublicIdsAsync(long projectId, CancellationToken cancellationToken)
        => (await _unitOfWork.ProjectStates.ListByProjectAsync(projectId, cancellationToken))
            .ToDictionary(state => state.Id, state => state.PublicId);

    private async Task<IReadOnlyList<ProjectReportTypeViewModel>> MapAllAsync(
        long projectId,
        IReadOnlyList<ProjectReportType> types,
        CancellationToken cancellationToken)
    {
        var colunas = await StatePublicIdsAsync(projectId, cancellationToken);
        return types.Select(type => Map(type, colunas)).ToList();
    }

    private static ProjectReportTypeViewModel Map(ProjectReportType type, IReadOnlyDictionary<long, Guid> colunas)
        => Map(type, type.InitialStateId is long id && colunas.TryGetValue(id, out var publicId) ? publicId : null);

    private static ProjectReportTypeViewModel Map(ProjectReportType type, Guid? initialStatePublicId) => new(
        type.PublicId,
        type.Name,
        type.Color,
        type.Icon,
        type.Position,
        type.IsActive,
        type.Questions,
        type.ShowsTextBox,
        type.TextBoxPrompt,
        initialStatePublicId,
        type.CreatedAt);

    /// <summary>O formulario do tipo depois de conferido, pronto para gravar.</summary>
    private sealed record TypeForm(
        string Name,
        CardColorEnum Color,
        ReportTypeIconEnum Icon,
        IReadOnlyList<string> Questions,
        bool ShowsTextBox,
        string? TextBoxPrompt,
        long? InitialStateId,
        Guid? InitialStatePublicId);
}
