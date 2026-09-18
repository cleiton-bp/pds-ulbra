using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;

namespace Pds.Service.Services;

/// <summary>
/// A ponte entre a fila de trabalho e a jornada publica.
///
/// <para><b>Grava o conjunto inteiro, e nunca uma ligacao sozinha.</b> Cada
/// gravacao cria uma versao, e uma versao e um retrato do mapa completo. Uma rota
/// por ligacao criaria uma versao por clique, e a linha do tempo de um relato
/// passaria a ser contada por um mapa que existiu por trinta segundos.</para>
///
/// <para><b>O passado nao se reescreve.</b> Alterar o mapeamento nao toca em linha
/// nenhuma das versoes anteriores: elas continuam la, e sao elas que explicam por
/// onde um relato de tres meses atras passou. Sem isso, reorganizar a jornada hoje
/// mudaria silenciosamente o que aconteceu — e nao haveria como saber disso
/// depois, porque o dado necessario para perceber teria sido justamente o
/// apagado.</para>
/// </summary>
public class ProjectStatusMappingService : IProjectStatusMappingService
{
    private readonly IUnitOfWork _unitOfWork;

    public ProjectStatusMappingService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<ProjectStatusMappingViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        return await BuildAsync(project, cancellationToken);
    }

    public async Task<ProjectStatusMappingViewModel> SaveAsync(Guid projectPublicId, SaveStatusMappingDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);

        var states = await _unitOfWork.ProjectStates.ListByProjectAsync(project.Id, cancellationToken);
        var stages = await _unitOfWork.ProjectPublicStages.ListByProjectAsync(project.Id, cancellationToken);

        var entries = dto.Entries ?? [];
        var statesByPublicId = states.ToDictionary(state => state.PublicId);
        var stagesByPublicId = stages.ToDictionary(stage => stage.PublicId);

        // O mesmo estado duas vezes seriam duas respostas para "onde este relato
        // esta agora", e qual valeria dependeria da ordem da consulta.
        if (entries.Select(entry => entry.StatePublicId).Distinct().Count() != entries.Count)
            throw new ArgumentException("Cada estado pode apontar para uma etapa so.");

        foreach (var entry in entries)
        {
            if (!statesByPublicId.ContainsKey(entry.StatePublicId))
                throw new KeyNotFoundException("Estado nao encontrado neste projeto.");

            if (!stagesByPublicId.ContainsKey(entry.StagePublicId))
                throw new KeyNotFoundException("Etapa nao encontrada neste projeto.");
        }

        var atual = await _unitOfWork.ProjectStatusMappings.ListByVersionAsync(project.Id, project.MappingVersion, cancellationToken);

        // Salvar sem ter mudado nada nao pode criar versao: a versao e o que separa
        // o mapa de hoje do mapa da epoca, e uma que nasce igual a anterior so
        // quebra a leitura do que ja aconteceu em dois pedacos identicos.
        if (MesmoMapa(atual, entries, statesByPublicId, stagesByPublicId))
            return await BuildAsync(project, cancellationToken);

        var versao = project.MappingVersion + 1;

        foreach (var entry in entries)
        {
            await _unitOfWork.ProjectStatusMappings.AddAsync(new ProjectStatusMapping
            {
                ProjectId = project.Id,
                ProjectStateId = statesByPublicId[entry.StatePublicId].Id,
                ProjectPublicStageId = stagesByPublicId[entry.StagePublicId].Id,
                Version = versao,
            }, cancellationToken);
        }

        // O numero do projeto entra depois das linhas, e no mesmo commit: ele e o
        // que diz qual versao vale, e aponta-lo para uma versao que ainda nao
        // existe deixaria o mapa vazio por um instante.
        project.MappingVersion = versao;
        _unitOfWork.Projects.Update(project);

        await _unitOfWork.CommitAsync(cancellationToken);

        return await BuildAsync(project, cancellationToken);
    }

    /// <summary>
    /// Monta o mapa de um projeto na versao que vale.
    ///
    /// <para>Traz <b>todo estado ativo</b>, mapeado ou nao, porque a tela precisa
    /// mostrar a pergunta inteira e nao so as respostas dadas. O aposentado so
    /// aparece se ainda tiver mapeamento: sem ele, nao ha o que configurar, e a
    /// lista encheria de nomes que ninguem vai mexer.</para>
    /// </summary>
    private async Task<ProjectStatusMappingViewModel> BuildAsync(Project project, CancellationToken cancellationToken)
    {
        var states = await _unitOfWork.ProjectStates.ListByProjectAsync(project.Id, cancellationToken);
        var stages = await _unitOfWork.ProjectPublicStages.ListByProjectAsync(project.Id, cancellationToken);
        var mappings = await _unitOfWork.ProjectStatusMappings.ListByVersionAsync(project.Id, project.MappingVersion, cancellationToken);

        var stageById = stages.ToDictionary(stage => stage.Id);
        var stageIdByStateId = mappings.ToDictionary(mapping => mapping.ProjectStateId, mapping => mapping.ProjectPublicStageId);

        var entries = states
            .Where(state => state.IsActive || stageIdByStateId.ContainsKey(state.Id))
            .Select(state =>
            {
                var stage = stageIdByStateId.TryGetValue(state.Id, out var stageId)
                            && stageById.TryGetValue(stageId, out var found)
                    ? found
                    : null;

                return new StatusMappingEntryViewModel(
                    state.PublicId,
                    state.Name,
                    state.IsActive,
                    stage?.PublicId,
                    stage?.Label);
            })
            .ToList();

        return new ProjectStatusMappingViewModel(
            project.MappingVersion,
            entries,
            entries.Count(entry => entry.StagePublicId is null));
    }

    /// <summary>
    /// O pedido diz a mesma coisa que a versao que ja vale?
    ///
    /// <para>Compara por identificador interno, e nao pelo publico, porque e o
    /// interno que esta gravado nas linhas da versao atual.</para>
    /// </summary>
    private static bool MesmoMapa(
        IReadOnlyList<ProjectStatusMapping> atual,
        IReadOnlyList<StatusMappingEntryDto> pedido,
        IReadOnlyDictionary<Guid, ProjectState> states,
        IReadOnlyDictionary<Guid, ProjectPublicStage> stages)
    {
        if (atual.Count != pedido.Count)
            return false;

        var gravado = atual.ToDictionary(mapping => mapping.ProjectStateId, mapping => mapping.ProjectPublicStageId);

        return pedido.All(entry =>
            gravado.TryGetValue(states[entry.StatePublicId].Id, out var stageId)
            && stageId == stages[entry.StagePublicId].Id);
    }

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");
}
