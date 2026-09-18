using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.PublicStages;

namespace Pds.Service.Services;

/// <summary>
/// A jornada que quem relatou acompanha.
///
/// <para><b>Aqui ha teto, e na fila de trabalho nao ha.</b> A diferenca nao e
/// descuido: quantas faixas o time usa por dentro e escolha de quem trabalha, mas a
/// jornada publica e uma historia contada para alguem de fora — e historia com
/// quinze capitulos e o mesmo organograma interno com palavras mais bonitas. Sao
/// no minimo tres e no maximo sete, conferidos na gravacao.</para>
///
/// <para><b>Aqui se remove, e na fila de trabalho so se aposenta.</b> Tambem nao e
/// descuido. O estado interno aposentado precisa continuar visivel porque a tela do
/// time mostra a fila inteira, aposentados incluidos; a etapa publica removida nao
/// tem esse papel — o que ja passou por ela e contado pelos eventos, que guardam o
/// rotulo que valia na epoca. A remocao e logica, entao a linha continua no
/// banco.</para>
/// </summary>
public class ProjectPublicStageService : IProjectPublicStageService
{
    private readonly IUnitOfWork _unitOfWork;

    public ProjectPublicStageService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<ProjectPublicStageViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var stages = await _unitOfWork.ProjectPublicStages.ListByProjectAsync(project.Id, cancellationToken);

        return stages.Select(Map).ToList();
    }

    public async Task<ProjectPublicStageViewModel> CreateAsync(Guid projectPublicId, SaveProjectPublicStageDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);

        var label = PublicStageText.Label(dto.Label);
        var description = PublicStageText.Description(dto.Description);
        var nextStep = PublicStageText.NextStep(dto.NextStep);
        var outcome = ResolveOutcome(dto);

        var total = await _unitOfWork.ProjectPublicStages.CountByProjectAsync(project.Id, cancellationToken);

        // O teto e conferido aqui, e nao na tela: a tela pode esconder o botao, mas
        // quem chama a rota direto continuaria passando.
        if (total >= ProjectPublicStage.MaxCount)
        {
            throw new ConflictException(
                $"A jornada publica pode ter ate {ProjectPublicStage.MaxCount} etapas. Acima disso ela vira a lista de estados de dentro, que e o que esta tela existe para esconder.");
        }

        if (await _unitOfWork.ProjectPublicStages.LabelExistsAsync(project.Id, label, cancellationToken: cancellationToken))
            throw new ConflictException("Esta jornada ja tem uma etapa com este nome.");

        var last = await _unitOfWork.ProjectPublicStages.LastPositionAsync(project.Id, cancellationToken);

        var stage = new ProjectPublicStage
        {
            ProjectId = project.Id,
            Label = label,
            Description = description,
            NextStep = nextStep,
            // Entra no fim, como o estado interno: quem acrescenta um passo depois
            // raramente o quer no comeco, e mandar para o topo mudaria a jornada de
            // quem nao pediu nada.
            Position = last + 1 ?? 0,
            IsTerminal = dto.IsTerminal,
            AllowsReturn = dto.AllowsReturn,
            AwaitsReporter = dto.AwaitsReporter,
            Outcome = outcome,
        };

        await _unitOfWork.ProjectPublicStages.AddAsync(stage, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(stage);
    }

    public async Task<ProjectPublicStageViewModel> UpdateAsync(Guid projectPublicId, Guid stagePublicId, SaveProjectPublicStageDto dto, CancellationToken cancellationToken = default)
    {
        var stage = await RequireStageAsync(projectPublicId, stagePublicId, cancellationToken);

        var label = PublicStageText.Label(dto.Label);
        var description = PublicStageText.Description(dto.Description);
        var nextStep = PublicStageText.NextStep(dto.NextStep);
        var outcome = ResolveOutcome(dto);

        // A excecao e a propria etapa: sem ela, salvar a tela sem ter mexido no
        // rotulo esbarraria no registro que esta sendo editado.
        if (await _unitOfWork.ProjectPublicStages.LabelExistsAsync(stage.ProjectId, label, stage.Id, cancellationToken))
            throw new ConflictException("Esta jornada ja tem uma etapa com este nome.");

        stage.Label = label;
        stage.Description = description;
        stage.NextStep = nextStep;
        stage.IsTerminal = dto.IsTerminal;
        stage.AllowsReturn = dto.AllowsReturn;
        stage.AwaitsReporter = dto.AwaitsReporter;
        stage.Outcome = outcome;

        _unitOfWork.ProjectPublicStages.Update(stage);
        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(stage);
    }

    public async Task RemoveAsync(Guid projectPublicId, Guid stagePublicId, CancellationToken cancellationToken = default)
    {
        var stage = await RequireStageAsync(projectPublicId, stagePublicId, cancellationToken);
        var total = await _unitOfWork.ProjectPublicStages.CountByProjectAsync(stage.ProjectId, cancellationToken);

        // O piso vale na remocao, e nao na criacao: a jornada precisa poder sair do
        // zero uma etapa por vez ate chegar la.
        if (total <= ProjectPublicStage.MinCount)
        {
            throw new ConflictException(
                $"A jornada publica precisa de pelo menos {ProjectPublicStage.MinCount} etapas. Com menos que isso ela nao conta uma historia: vira chegou e acabou.");
        }

        // Etapa que ainda recebe estado nao sai. Tirar uma que esta no mapa abriria um
        // buraco silencioso: os relatos daqueles estados parariam de andar do lado de
        // fora, e o mapa continuaria parecendo completo. A saida e remapear antes, e
        // a mensagem diz isso em vez de so recusar — mesmo desenho da recusa de
        // aposentar a porta de entrada de um tipo.
        var project = await _unitOfWork.Projects.GetByPublicIdAsync(projectPublicId, cancellationToken);

        if (project is not null
            && await _unitOfWork.ProjectStatusMappings.AnyUsingStageAsync(stage.Id, project.MappingVersion, cancellationToken))
        {
            throw new ConflictException(
                "Algum estado da sua fila ainda entra nesta etapa. Aponte esses estados para outra etapa antes de remove-la.");
        }

        await _unitOfWork.ProjectPublicStages.SoftDeleteAsync(stage, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ProjectPublicStageViewModel>> ReorderAsync(Guid projectPublicId, ReorderProjectPublicStagesDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var stages = await _unitOfWork.ProjectPublicStages.ListByProjectAsync(project.Id, cancellationToken);

        var order = dto.Order ?? [];
        var byPublicId = stages.ToDictionary(stage => stage.PublicId);

        // A jornada inteira, uma vez cada — a mesma regra da fila de trabalho.
        // Aceitar uma lista parcial deixaria sem resposta a pergunta de onde fica o
        // que ficou de fora.
        if (order.Count != stages.Count
            || order.Distinct().Count() != order.Count
            || order.Any(publicId => !byPublicId.ContainsKey(publicId)))
        {
            throw new ArgumentException("A ordem precisa trazer todas as etapas desta jornada, uma vez cada.");
        }

        for (var position = 0; position < order.Count; position++)
        {
            var stage = byPublicId[order[position]];
            if (stage.Position == position)
                continue;

            stage.Position = position;
            _unitOfWork.ProjectPublicStages.Update(stage);
        }

        await _unitOfWork.CommitAsync(cancellationToken);

        // Devolve na ordem pedida, e nao relendo do banco: e a mesma lista, e uma
        // segunda consulta so daria chance de a tela receber algo diferente do que
        // acabou de ser gravado.
        return order.Select(publicId => Map(byPublicId[publicId])).ToList();
    }

    public async Task<IReadOnlyList<ProjectPublicStageViewModel>> ApplyFactoryAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var total = await _unitOfWork.ProjectPublicStages.CountByProjectAsync(project.Id, cancellationToken);

        // So com a jornada vazia. Somar ao que ja existe faria desta rota um jeito de
        // duplicar rotulo — e o pedido nao e "acrescente o padrao", e "comece pelo
        // padrao".
        if (total > 0)
            throw new ConflictException("Esta jornada ja tem etapas. O conjunto padrao so preenche uma jornada vazia.");

        var stages = FactoryPublicStages.For(project).ToList();

        foreach (var stage in stages)
            await _unitOfWork.ProjectPublicStages.AddAsync(stage, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        return stages.Select(Map).ToList();
    }

    /// <summary>
    /// Confere o par terminal/desfecho, que so faz sentido junto.
    ///
    /// <para>Recusa os dois lados. Terminal sem desfecho e um fim sem explicacao —
    /// a pessoa le "encerrado" e nao sabe se foi feito ou descartado. Desfecho em
    /// etapa que nao e terminal e um final no meio da jornada, que a linha do tempo
    /// nao teria como desenhar.</para>
    /// </summary>
    private static PublicOutcomeEnum? ResolveOutcome(SaveProjectPublicStageDto dto)
    {
        if (dto.IsTerminal && dto.Outcome is null)
            throw new ArgumentException("Escolha o desfecho desta etapa: e nela que o relato termina, e quem le precisa saber como terminou.");

        if (!dto.IsTerminal && dto.Outcome is not null)
            throw new ArgumentException("So a etapa em que o relato termina tem desfecho.");

        return dto.Outcome;
    }

    private async Task<ProjectPublicStage> RequireStageAsync(Guid projectPublicId, Guid stagePublicId, CancellationToken cancellationToken)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var stage = await _unitOfWork.ProjectPublicStages.GetByPublicIdAsync(stagePublicId, cancellationToken);

        // O filtro global ja garante que a etapa e da conta da sessao, mas nao que e
        // **deste** projeto: sem esta conferencia, o identificador de uma etapa de
        // outro projeto da mesma conta seria aceito pela rota errada.
        if (stage is null || stage.ProjectId != project.Id)
            throw new KeyNotFoundException("Etapa nao encontrada neste projeto.");

        return stage;
    }

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    private static ProjectPublicStageViewModel Map(ProjectPublicStage stage) => new(
        stage.PublicId,
        stage.Label,
        stage.Description,
        stage.NextStep,
        stage.Position,
        stage.IsTerminal,
        stage.AllowsReturn,
        stage.AwaitsReporter,
        stage.Outcome,
        stage.CreatedAt);
}
