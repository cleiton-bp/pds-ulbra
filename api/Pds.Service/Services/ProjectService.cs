using System.Text.Json;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Filters;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.Security;
using Pds.Domain.ViewModels;
using Pds.Service.Projects;
using Pds.Service.PublicStages;
using Pds.Service.Security;

namespace Pds.Service.Services;

public class ProjectService : IProjectService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAccountContext _accountContext;

    public ProjectService(IUnitOfWork unitOfWork, IAccountContext accountContext)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
    }

    /// <summary>
    /// A conta propria vem sempre da sessao. Nenhuma rota aceita conta por
    /// parametro — e por isso projeto novo nasce sempre na conta de quem cria.
    /// </summary>
    private long AccountId => _accountContext.AccountId
                              ?? throw new UnauthorizedAccessException("Sessao sem conta.");

    public async Task<ProjectCreatedViewModel> CreateAsync(CreateProjectDto dto, CancellationToken cancellationToken = default)
    {
        var name = (dto.Name ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("O nome do projeto e obrigatorio.");

        // Sem modelo, o quadro simples: quem so digita o nome recebe o projeto de
        // sempre. O modelo so decide o que nasce junto — o resto da criacao e igual.
        var modelo = ProjectTemplates.For(dto.Template ?? ProjectTemplateEnum.SimpleBoard);

        if (await _unitOfWork.Projects.NameExistsAsync(AccountId, name, cancellationToken: cancellationToken))
            throw new ConflictException("Ja existe um projeto com este nome na conta.");

        var account = await _unitOfWork.Accounts.GetByIdAsync(AccountId, cancellationToken)
                      ?? throw new UnauthorizedAccessException("Sessao sem conta.");

        var project = new Project
        {
            AccountId = account.Id,
            Account = account,
            Name = name,
            Status = ProjectStatusEnum.Active,
        };
        await _unitOfWork.Projects.AddAsync(project, cancellationToken);

        // A chave publica nasce junto com o projeto: sem ela o site nao manda relato,
        // e obrigar a um segundo passo so cria a chance de esquecer. A secreta nao:
        // ela serve a um uso que pouca gente tem, e nasce sob pedido na tela de
        // chaves — junto daqui, aparecia uma vez so para quem ainda nem sabia se
        // precisava dela.
        var (publicValue, publicPrefix) = ProjectKeyGenerator.GeneratePublic();
        var publicKey = new ProjectKey
        {
            Project = project,
            Type = ProjectKeyTypeEnum.Public,
            Value = publicValue,
            Prefix = publicPrefix,
        };

        await _unitOfWork.ProjectKeys.AddAsync(publicKey, cancellationToken);

        // A jornada publica nasce junto, com a do modelo (no quadro simples, o conjunto
        // padrao): tela em branco nao se preenche, e uma jornada inteira com frase
        // explicativa em cada passo e muito para inventar do zero. Tudo editavel,
        // removivel e reordenavel depois — o padrao e ponto de partida, nao regra.
        var etapas = FactoryPublicStages.For(project, modelo.PublicStages).ToList();
        foreach (var stage in etapas)
            await _unitOfWork.ProjectPublicStages.AddAsync(stage, cancellationToken);

        // E as colunas do quadro, ja ligadas a jornada (ver `ProjectTemplates`). A
        // ultima e a que encerra, pela regra de fabrica do ciclo.
        var colunas = new Dictionary<string, ProjectState>();
        var ligadas = 0;
        for (var position = 0; position < modelo.Columns.Count; position++)
        {
            var (nome, rotulo) = modelo.Columns[position];
            var coluna = new ProjectState
            {
                Project = project,
                Name = nome,
                Position = position,
            };
            await _unitOfWork.ProjectStates.AddAsync(coluna, cancellationToken);
            colunas[nome] = coluna;

            var etapa = etapas.FirstOrDefault(stage => stage.Label == rotulo);
            if (etapa is null)
                continue;

            // A versao 1 do mapa, como se alguem tivesse salvo a tela: e um mapa como
            // qualquer outro, e a proxima gravacao vira a versao 2.
            await _unitOfWork.ProjectStatusMappings.AddAsync(new ProjectStatusMapping
            {
                Project = project,
                ProjectState = coluna,
                ProjectPublicStage = etapa,
                Version = 1,
            }, cancellationToken);
            ligadas++;
        }

        if (ligadas > 0)
            project.MappingVersion = 1;

        // E as prioridades de fabrica, da menos para a mais urgente, iguais em todo
        // modelo: o time prioriza no primeiro dia sem abrir a Configuracao. O card
        // continua nascendo sem prioridade — escolher e do time.
        for (var position = 0; position < PriorityDefaults.Factory.Count; position++)
        {
            var (nome, cor) = PriorityDefaults.Factory[position];

            await _unitOfWork.ProjectPriorities.AddAsync(new ProjectPriority
            {
                Project = project,
                Name = nome,
                Color = cor,
                Position = position,
            }, cancellationToken);
        }

        // E os tipos de relato do modelo, na ordem: o formulario ja pergunta certo no
        // primeiro relato, sem ninguem abrir a Configuracao. Tipo sem coluna escolhida
        // entra na primeira coluna ativa, como no quadro simples.
        for (var position = 0; position < modelo.ReportTypes.Count; position++)
        {
            var (tipo, entrada) = modelo.ReportTypes[position];

            await _unitOfWork.ProjectReportTypes.AddAsync(new ProjectReportType
            {
                Project = project,
                Name = tipo.Name,
                Icon = tipo.Icon,
                Color = tipo.Color,
                Questions = [.. tipo.Questions],
                ShowsTextBox = tipo.ShowsTextBox,
                TextBoxPrompt = tipo.TextBoxPrompt,
                Position = position,
                InitialState = entrada is null ? null : colunas[entrada],
            }, cancellationToken);
        }

        // As regras do ciclo so ganham linha quando o modelo muda alguma delas — hoje,
        // as sprints do Scrum. Sem linha, valem os padroes do codigo; com ela, todo o
        // resto continua sendo o padrao, copiado aqui.
        if (modelo.SprintsEnabled)
            await _unitOfWork.ProjectCycleSettings.AddAsync(SprintCycleSettings(project), cancellationToken);

        // E o registro da criacao, com o modelo escolhido: o projeto nao guarda de
        // qual modelo veio, e a analise quer saber como as pessoas comecam. So o
        // modelo — o nome do projeto e de quem cria, e esta tabela nao se apaga.
        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = account.Id,
            Project = project,
            UserId = _accountContext.UserId,
            Type = EventTypeEnum.ProjectCreated,
            Source = EventSourceEnum.Panel,
            Payload = JsonSerializer.Serialize(new
            {
                template = JsonNamingPolicy.SnakeCaseLower.ConvertName(modelo.Kind.ToString()),
            }),
        }, cancellationToken);

        // Um unico commit: ou o projeto, a chave, a jornada, as colunas com o mapa,
        // as prioridades, os tipos, as regras do ciclo e o evento entram, ou nao
        // entra nada.
        await _unitOfWork.CommitAsync(cancellationToken);

        // Quem cria e dono: o projeto nasceu na conta propria. A lista de acesso da
        // requisicao foi montada antes dele existir, entao o papel sai daqui. E
        // projeto recem-criado nao tem movimento nenhum.
        return new ProjectCreatedViewModel(
            Map(project, new ProjectAccess(project.Id, project.PublicId, ProjectRoleEnum.Administrator, true), null),
            MapKey(publicKey));
    }

    /// <summary>
    /// As regras do ciclo de um projeto que nasce em sprints: tudo no padrao de
    /// <see cref="CycleSettingsDefaults"/>, menos as sprints, ligadas.
    ///
    /// <para><b>Copia o padrao inteiro</b> porque a linha, depois de existir, e lida
    /// campo a campo — e um campo esquecido aqui valeria zero ou falso, e nao o
    /// padrao. A duracao e a de fabrica, duas semanas.</para>
    /// </summary>
    private static ProjectCycleSettings SprintCycleSettings(Project project) => new()
    {
        Project = project,
        ClosureTrigger = CycleSettingsDefaults.ClosureTrigger,
        PublicDelayMinutes = CycleSettingsDefaults.PublicDelayMinutes,
        AllowsReopen = CycleSettingsDefaults.AllowsReopen,
        ReopenStateId = CycleSettingsDefaults.ReopenStateId,
        ReopenRequiresComment = CycleSettingsDefaults.ReopenRequiresComment,
        TrackingCodeCanAct = CycleSettingsDefaults.TrackingCodeCanAct,
        SatisfactionEnabled = CycleSettingsDefaults.SatisfactionEnabled,
        SatisfactionStyle = CycleSettingsDefaults.SatisfactionStyle,
        SatisfactionRequired = CycleSettingsDefaults.SatisfactionRequired,
        InfoRequestEnabled = CycleSettingsDefaults.InfoRequestEnabled,
        InfoRequestWarnDays = CycleSettingsDefaults.InfoRequestWarnDays,
        InfoRequestCloseDays = CycleSettingsDefaults.InfoRequestCloseDays,
        AcceptsQuestionsDefault = CycleSettingsDefaults.AcceptsQuestionsDefault,
        AllowsReportArchiving = CycleSettingsDefaults.AllowsReportArchiving,
        LastColumnVisibleDays = CycleSettingsDefaults.LastColumnVisibleDays,
        DueSoonDays = CycleSettingsDefaults.DueSoonDays,
        SprintsEnabled = true,
        SprintLengthWeeks = CycleSettingsDefaults.SprintLengthWeeks,
    };

    public async Task<IReadOnlyList<ProjectViewModel>> ListAsync(CancellationToken cancellationToken = default)
    {
        var projects = await _unitOfWork.Projects.ListAsync(cancellationToken);
        var movimento = await _unitOfWork.Projects.ActivityOfAsync(
            projects.Select(project => project.Id).ToList(), cancellationToken);

        return projects
            .Select(project => Map(project, AccessTo(project), movimento.GetValueOrDefault(project.Id)))
            .ToList();
    }

    public async Task<ProjectViewModel> GetAsync(Guid publicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(publicId, cancellationToken);
        return await MapWithActivityAsync(project, cancellationToken);
    }

    public async Task<ProjectViewModel> UpdateAsync(Guid publicId, UpdateProjectDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(publicId, cancellationToken);

        if (dto.Name is not null)
        {
            var name = dto.Name.Trim();

            if (string.IsNullOrWhiteSpace(name))
                throw new ArgumentException("O nome do projeto e obrigatorio.");

            // A conta do projeto, e nao a da sessao: quem renomeia pode ser
            // administrador de um projeto de outra conta.
            if (await _unitOfWork.Projects.NameExistsAsync(project.AccountId, name, project.Id, cancellationToken))
                throw new ConflictException("Ja existe um projeto com este nome na conta.");

            project.Name = name;
        }

        if (dto.Status is not null)
            project.Status = dto.Status.Value;

        _unitOfWork.Projects.Update(project);
        await _unitOfWork.CommitAsync(cancellationToken);

        return await MapWithActivityAsync(project, cancellationToken);
    }

    /// <summary>
    /// Busca, entre os projetos que a pessoa enxerga, o projeto pelo identificador
    /// publico — com a conta dona, que a resposta leva.
    ///
    /// Projeto em que a pessoa nao esta cai aqui como "nao encontrado", e nao como
    /// "sem permissao" — o filtro global simplesmente nao o devolve. E a resposta
    /// certa tambem do ponto de vista de quem pergunta: dizer "existe, mas nao e
    /// seu" ja e contar que existe.
    /// </summary>
    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetWithAccountAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    /// <summary>
    /// O papel da pessoa num projeto que o filtro devolveu. Se o filtro devolveu, o
    /// acesso esta na lista — os dois vem da mesma montagem no middleware.
    /// </summary>
    private ProjectAccess AccessTo(Project project)
        => _accountContext.FindProject(project.Id)
           ?? throw new InvalidOperationException("Projeto devolvido pelo filtro sem acesso na sessao.");

    /// <summary>O projeto de uma rota so, com o movimento dele lido junto.</summary>
    private async Task<ProjectViewModel> MapWithActivityAsync(Project project, CancellationToken cancellationToken)
    {
        var movimento = await _unitOfWork.Projects.ActivityOfAsync([project.Id], cancellationToken);
        return Map(project, AccessTo(project), movimento.GetValueOrDefault(project.Id));
    }

    private static ProjectViewModel Map(Project project, ProjectAccess access, ProjectActivity? activity) => new(
        project.PublicId,
        project.Name,
        project.Status,
        project.CreatedAt,
        project.UpdatedAt,
        new ProjectAccountViewModel(project.Account.PublicId, project.Account.Name),
        access.Role,
        access.IsAccountOwner,
        activity?.LastReportReceivedAt,
        activity?.LastActivityAt);

    private static ProjectKeyViewModel MapKey(ProjectKey key) => new(
        key.PublicId,
        key.Type,
        key.Value,
        key.Prefix,
        key.IsActive,
        key.CreatedAt,
        key.RevokedAt,
        key.LastUsedAt);
}
