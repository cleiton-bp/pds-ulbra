using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.States;

namespace Pds.Service.Services;

/// <summary>
/// A fila de trabalho de um projeto.
///
/// <para><b>Nao ha teto de quantos estados cabem.</b> Foi decidido assim: a
/// ferramenta e do feitio de um quadro de cards, e quantas faixas o trabalho tem
/// e escolha de quem trabalha. Diferente do endereco autorizado, que tem teto
/// porque a lista inteira e lida a cada abertura da ferramenta, esta e lida so
/// por quem abriu a tela.</para>
///
/// <para><b>Nao existe apagar.</b> So aposentar — ver
/// <see cref="DeactivateAsync"/>.</para>
/// </summary>
public class ProjectStateService : IProjectStateService
{
    private readonly IUnitOfWork _unitOfWork;

    public ProjectStateService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<ProjectStateViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var states = await _unitOfWork.ProjectStates.ListByProjectAsync(project.Id, cancellationToken);

        return states.Select(Map).ToList();
    }

    public async Task<ProjectStateViewModel> CreateAsync(Guid projectPublicId, CreateProjectStateDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var name = StateName.Normalize(dto.Name);

        if (await _unitOfWork.ProjectStates.NameExistsAsync(project.Id, name, cancellationToken: cancellationToken))
            throw new ConflictException("Este projeto ja tem um estado com este nome.");

        var last = await _unitOfWork.ProjectStates.LastPositionAsync(project.Id, cancellationToken);

        var state = new ProjectState
        {
            ProjectId = project.Id,
            Name = name,
            // Entra no fim: quem cria um estado depois raramente quer ele no comeco,
            // e mandar para o topo mudaria a fila de quem nao pediu nada.
            Position = last + 1 ?? 0,
        };

        await _unitOfWork.ProjectStates.AddAsync(state, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(state);
    }

    public async Task<ProjectStateViewModel> RenameAsync(Guid projectPublicId, Guid statePublicId, RenameProjectStateDto dto, CancellationToken cancellationToken = default)
    {
        var (_, state) = await RequireStateAsync(projectPublicId, statePublicId, cancellationToken);
        var name = StateName.Normalize(dto.Name);

        // A excecao e o proprio estado: sem ela, salvar a mesma palavra com um
        // acento corrigido esbarraria no registro que esta sendo editado.
        if (await _unitOfWork.ProjectStates.NameExistsAsync(state.ProjectId, name, state.Id, cancellationToken))
            throw new ConflictException("Este projeto ja tem um estado com este nome.");

        state.Name = name;
        _unitOfWork.ProjectStates.Update(state);
        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(state);
    }

    public async Task<IReadOnlyList<ProjectStateViewModel>> ReorderAsync(Guid projectPublicId, ReorderProjectStatesDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var states = await _unitOfWork.ProjectStates.ListByProjectAsync(project.Id, cancellationToken);

        var order = dto.Order ?? [];
        var byPublicId = states.ToDictionary(state => state.PublicId);

        // Tem de ser a fila inteira, uma vez cada. Aceitar uma lista parcial
        // deixaria sem resposta a pergunta de onde fica o que ficou de fora — e a
        // resposta acabaria sendo a posicao antiga, que e justamente a que esta
        // sendo trocada.
        if (order.Count != states.Count
            || order.Distinct().Count() != order.Count
            || order.Any(publicId => !byPublicId.ContainsKey(publicId)))
        {
            throw new ArgumentException("A ordem precisa trazer todos os estados deste projeto, uma vez cada.");
        }

        for (var position = 0; position < order.Count; position++)
        {
            var state = byPublicId[order[position]];
            if (state.Position == position)
                continue;

            state.Position = position;
            _unitOfWork.ProjectStates.Update(state);
        }

        await _unitOfWork.CommitAsync(cancellationToken);

        // Devolve na ordem pedida, e nao relendo do banco: e a mesma lista, e uma
        // segunda consulta so daria chance de a tela receber algo diferente do que
        // acabou de ser gravado.
        return order.Select(publicId => Map(byPublicId[publicId])).ToList();
    }

    /// <summary>
    /// Aposenta o estado em vez de apaga-lo.
    ///
    /// <para>Apagar nao existe de proposito: relato antigo aponta para o estado, e
    /// o historico precisa continuar legivel. Um estado que some levaria junto o
    /// sentido de tudo que passou por ele.</para>
    /// </summary>
    public async Task<ProjectStateViewModel> DeactivateAsync(Guid projectPublicId, Guid statePublicId, CancellationToken cancellationToken = default)
    {
        var (_, state) = await RequireStateAsync(projectPublicId, statePublicId, cancellationToken);

        // Aposentar o que ja esta aposentado nao e erro, e so nao ter o que fazer.
        // Recusar transformaria dois cliques seguidos numa mensagem vermelha.
        if (state.IsActive)
        {
            state.DeactivatedAt = DateTime.UtcNow;
            _unitOfWork.ProjectStates.Update(state);
            await _unitOfWork.CommitAsync(cancellationToken);
        }

        return Map(state);
    }

    public async Task<ProjectStateViewModel> ActivateAsync(Guid projectPublicId, Guid statePublicId, CancellationToken cancellationToken = default)
    {
        var (_, state) = await RequireStateAsync(projectPublicId, statePublicId, cancellationToken);

        // Nao ha o que conferir de nome: o repetido e barrado entre todos os
        // estados do projeto, aposentados inclusive, entao voltar nunca colide.
        if (!state.IsActive)
        {
            state.DeactivatedAt = null;
            _unitOfWork.ProjectStates.Update(state);
            await _unitOfWork.CommitAsync(cancellationToken);
        }

        return Map(state);
    }

    private async Task<(Project Project, ProjectState State)> RequireStateAsync(Guid projectPublicId, Guid statePublicId, CancellationToken cancellationToken)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var state = await _unitOfWork.ProjectStates.GetByPublicIdAsync(statePublicId, cancellationToken);

        // O filtro global ja garante que o estado e da conta da sessao, mas nao que
        // e **deste** projeto: sem esta conferencia, o identificador de um estado de
        // outro projeto da mesma conta seria aceito pela rota errada.
        if (state is null || state.ProjectId != project.Id)
            throw new KeyNotFoundException("Estado nao encontrado neste projeto.");

        return (project, state);
    }

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    private static ProjectStateViewModel Map(ProjectState state) => new(
        state.PublicId,
        state.Name,
        state.Position,
        state.IsActive,
        state.CreatedAt);
}
