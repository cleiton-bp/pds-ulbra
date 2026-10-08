using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Filters;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.Security;
using Pds.Domain.ViewModels;
using Pds.Service.PublicStages;
using Pds.Service.Security;

namespace Pds.Service.Services;

public class ProjectService : IProjectService
{
    /// <summary>
    /// As colunas com que o projeto nasce, na ordem, e a etapa publica em que cada uma
    /// entra.
    ///
    /// <para><b>Tres, e nao uma.</b> Com uma coluna so o quadro nao anda: ela era a
    /// entrada e o fim ao mesmo tempo, e o time precisava achar a configuracao antes
    /// de mover o primeiro card. "A fazer, Fazendo, Feito" e o que quem chega de um
    /// quadro simples espera no primeiro minuto — e a ultima e a que encerra, pela
    /// regra de fabrica do ciclo (a ultima coluna ativa).</para>
    ///
    /// <para><b>Ja ligadas ao andamento publico.</b> Sem a ligacao, o relato andava
    /// por dentro e quem relatou continuava lendo "Recebido", sem ninguem perceber.
    /// A etapa vem pelo rotulo do conjunto de fabrica; se um dia ele mudar e o
    /// rotulo sumir, a coluna so nasce sem ligacao — nada quebra.</para>
    ///
    /// <para>Os nomes <b>tem acento de proposito</b>, diferente das mensagens do
    /// sistema: nao sao texto nosso, sao colunas que o cliente ve na tela e renomeia
    /// quando quiser.</para>
    /// </summary>
    private static readonly IReadOnlyList<(string Name, string PublicStage)> FactoryStates =
    [
        ("A fazer", "Recebido"),
        ("Fazendo", "Em desenvolvimento"),
        ("Feito", "Concluído"),
    ];

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

        // A jornada publica nasce junto, com o conjunto padrao: tela em branco nao se
        // preenche, e cinco passos com frase explicativa em cada um e muito para
        // inventar do zero. Tudo editavel, removivel e reordenavel depois — o padrao
        // e ponto de partida, nao regra.
        var etapas = FactoryPublicStages.For(project).ToList();
        foreach (var stage in etapas)
            await _unitOfWork.ProjectPublicStages.AddAsync(stage, cancellationToken);

        // E as colunas do quadro, ja ligadas a jornada (ver `FactoryStates`). Nao
        // gravamos junto uma escolha de onde cada tipo cai: sem escolha, o relato vai
        // para a primeira coluna ativa, que e "A fazer". Assim o caminho "o cliente
        // nao configurou" e o caminho comum, exercitado por todo projeto novo.
        var ligadas = 0;
        for (var position = 0; position < FactoryStates.Count; position++)
        {
            var (nome, rotulo) = FactoryStates[position];
            var coluna = new ProjectState
            {
                Project = project,
                Name = nome,
                Position = position,
            };
            await _unitOfWork.ProjectStates.AddAsync(coluna, cancellationToken);

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

        // E as prioridades de fabrica, da menos para a mais urgente: o time prioriza
        // no primeiro dia sem abrir a Configuracao. O card continua nascendo sem
        // prioridade — escolher e do time.
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

        // Um unico commit: ou o projeto, a chave, a jornada, as colunas com o mapa e
        // as prioridades entram, ou nao entra nada.
        await _unitOfWork.CommitAsync(cancellationToken);

        // Quem cria e dono: o projeto nasceu na conta propria. A lista de acesso da
        // requisicao foi montada antes dele existir, entao o papel sai daqui. E
        // projeto recem-criado nao tem movimento nenhum.
        return new ProjectCreatedViewModel(
            Map(project, new ProjectAccess(project.Id, project.PublicId, ProjectRoleEnum.Administrator, true), null),
            MapKey(publicKey));
    }

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
