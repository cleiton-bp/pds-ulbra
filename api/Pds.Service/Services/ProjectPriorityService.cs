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
/// As prioridades de um projeto, como os estados: criar, renomear, trocar a cor,
/// reordenar, aposentar e reativar.
///
/// <para><b>Nao existe apagar</b>, so aposentar: card antigo aponta para a
/// prioridade, e o historico precisa continuar legivel.</para>
///
/// <para><b>Sem <c>Update</c> em lugar nenhum</b>: as linhas ja sao rastreadas, e a
/// gravacao leva so o que mudou.</para>
/// </summary>
public class ProjectPriorityService : IProjectPriorityService
{
    private const string Que = "a prioridade";

    private readonly IUnitOfWork _unitOfWork;

    /// <summary>
    /// A tela de Trabalho dos outros le esta configuracao: mudou, ela rele. Ver
    /// <see cref="IWorkNotifier"/>.
    /// </summary>
    private readonly IWorkNotifier _notifier;

    public ProjectPriorityService(IUnitOfWork unitOfWork, IWorkNotifier notifier)
    {
        _notifier = notifier;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<ProjectPriorityViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var priorities = await _unitOfWork.ProjectPriorities.ListByProjectAsync(project.Id, cancellationToken);

        return priorities.Select(Map).ToList();
    }

    public async Task<ProjectPriorityViewModel> CreateAsync(Guid projectPublicId, CreateProjectPriorityDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var name = CardText.Name(dto.Name, ProjectPriority.MaxNameLength, Que);
        var color = RequireColor(dto.Color);

        if (await _unitOfWork.ProjectPriorities.NameExistsAsync(project.Id, name, cancellationToken: cancellationToken))
            throw new ConflictException("Este projeto ja tem uma prioridade com este nome.");

        var last = await _unitOfWork.ProjectPriorities.LastPositionAsync(project.Id, cancellationToken);

        var priority = new ProjectPriority
        {
            ProjectId = project.Id,
            Name = name,
            Color = color,
            // Entra como a mais urgente, no fim da lista: e o caso mais comum de quem
            // cria uma prioridade depois ("Bloqueante"), e a ordem se ajusta arrastando.
            Position = last + 1 ?? 0,
        };

        await _unitOfWork.ProjectPriorities.AddAsync(priority, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.ProjectChangedAsync(projectPublicId);

        return Map(priority);
    }

    public async Task<ProjectPriorityViewModel> UpdateAsync(Guid projectPublicId, Guid priorityPublicId, UpdateProjectPriorityDto dto, CancellationToken cancellationToken = default)
    {
        var (_, priority) = await RequirePriorityAsync(projectPublicId, priorityPublicId, cancellationToken);
        var name = CardText.Name(dto.Name, ProjectPriority.MaxNameLength, Que);
        var color = RequireColor(dto.Color);

        // A excecao e a propria prioridade: corrigir um acento nao pode esbarrar nela.
        if (await _unitOfWork.ProjectPriorities.NameExistsAsync(priority.ProjectId, name, priority.Id, cancellationToken))
            throw new ConflictException("Este projeto ja tem uma prioridade com este nome.");

        priority.Name = name;
        priority.Color = color;
        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.ProjectChangedAsync(projectPublicId);

        return Map(priority);
    }

    public async Task<IReadOnlyList<ProjectPriorityViewModel>> ReorderAsync(Guid projectPublicId, ReorderProjectPrioritiesDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var priorities = await _unitOfWork.ProjectPriorities.ListByProjectAsync(project.Id, cancellationToken);

        var order = dto.Order ?? [];
        var byPublicId = priorities.ToDictionary(priority => priority.PublicId);

        // A lista inteira, uma vez cada — como na ordem dos estados, e pelo mesmo
        // motivo: uma lista parcial nao diria onde fica o que ficou de fora.
        if (order.Count != priorities.Count
            || order.Distinct().Count() != order.Count
            || order.Any(publicId => !byPublicId.ContainsKey(publicId)))
        {
            throw new ArgumentException("A ordem precisa trazer todas as prioridades deste projeto, uma vez cada.");
        }

        for (var position = 0; position < order.Count; position++)
            byPublicId[order[position]].Position = position;

        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.ProjectChangedAsync(projectPublicId);

        return order.Select(publicId => Map(byPublicId[publicId])).ToList();
    }

    /// <summary>
    /// Aposenta: a prioridade continua nos cards que ja a tem e some da lista de
    /// escolha. Aposentar o que ja esta aposentado nao e erro.
    /// </summary>
    public async Task<ProjectPriorityViewModel> DeactivateAsync(Guid projectPublicId, Guid priorityPublicId, CancellationToken cancellationToken = default)
    {
        var (_, priority) = await RequirePriorityAsync(projectPublicId, priorityPublicId, cancellationToken);

        if (priority.IsActive)
        {
            priority.DeactivatedAt = DateTime.UtcNow;
            await _unitOfWork.CommitAsync(cancellationToken);
            await _notifier.ProjectChangedAsync(projectPublicId);
        }

        return Map(priority);
    }

    public async Task<ProjectPriorityViewModel> ActivateAsync(Guid projectPublicId, Guid priorityPublicId, CancellationToken cancellationToken = default)
    {
        var (_, priority) = await RequirePriorityAsync(projectPublicId, priorityPublicId, cancellationToken);

        // O nome repetido e barrado entre todas, aposentadas inclusive: voltar nunca colide.
        if (!priority.IsActive)
        {
            priority.DeactivatedAt = null;
            await _unitOfWork.CommitAsync(cancellationToken);
            await _notifier.ProjectChangedAsync(projectPublicId);
        }

        return Map(priority);
    }

    private static CardColorEnum RequireColor(CardColorEnum? color)
    {
        var cor = color ?? throw new ArgumentException("Escolha a cor da prioridade.");

        // O numero que nao e cor nenhuma passa pela leitura do JSON — e iria parar
        // no banco como texto que ninguem sabe desenhar.
        if (!Enum.IsDefined(cor))
            throw new ArgumentException("Escolha uma cor da paleta.");

        return cor;
    }

    private async Task<(Project Project, ProjectPriority Priority)> RequirePriorityAsync(Guid projectPublicId, Guid priorityPublicId, CancellationToken cancellationToken)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var priority = await _unitOfWork.ProjectPriorities.GetByPublicIdAsync(priorityPublicId, cancellationToken);

        // O filtro global garante que e de um projeto que a pessoa enxerga, e nao que
        // e deste — como no estado. Sem esta conferencia, quem administra aqui e so
        // membro la mudaria a configuracao de la.
        if (priority is null || priority.ProjectId != project.Id)
            throw new KeyNotFoundException("Prioridade nao encontrada neste projeto.");

        return (project, priority);
    }

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    private static ProjectPriorityViewModel Map(ProjectPriority priority) => new(
        priority.PublicId,
        priority.Name,
        priority.Color,
        priority.Position,
        priority.IsActive,
        priority.CreatedAt);
}
