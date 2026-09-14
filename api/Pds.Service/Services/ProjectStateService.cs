using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
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
            // Mas aposentar a porta de entrada de um tipo, sim: o relato seguinte
            // daquele tipo cairia num estado aposentado, que e exatamente o que
            // aposentar existe para impedir. A saida e escolher outro destino
            // antes, e a mensagem diz isso em vez de so recusar.
            if (await _unitOfWork.ProjectInitialStates.AnyUsingStateAsync(state.Id, cancellationToken))
            {
                throw new ConflictException(
                    "Este estado e a entrada de algum tipo de relato. Escolha outro destino antes de aposenta-lo.");
            }

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

    public async Task<IReadOnlyList<ProjectInitialStateViewModel>> ListInitialAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var escolhas = await _unitOfWork.ProjectInitialStates.ListByProjectAsync(project.Id, cancellationToken);
        var estados = await _unitOfWork.ProjectStates.ListByProjectAsync(project.Id, cancellationToken);

        // Os tres tipos saem sempre, escolhidos ou nao. Devolver so os escolhidos
        // faria a tela ter de adivinhar quais faltam, e um tipo novo apareceria la
        // sozinho no dia em que entrasse no enum.
        return Enum.GetValues<ReportTypeEnum>()
            .Select(tipo =>
            {
                var escolha = escolhas.FirstOrDefault(item => item.ReportType == tipo);
                var estado = escolha is null
                    ? null
                    : estados.FirstOrDefault(item => item.Id == escolha.ProjectStateId);

                return new ProjectInitialStateViewModel(tipo, estado?.PublicId);
            })
            .ToList();
    }

    public async Task<ProjectInitialStateViewModel> SetInitialAsync(Guid projectPublicId, SetInitialStateDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);

        if (dto.ReportType is null)
            throw new ArgumentException("Informe o tipo de relato.");

        var tipo = dto.ReportType.Value;
        var atual = await _unitOfWork.ProjectInitialStates.FindByTypeAsync(project.Id, tipo, cancellationToken);

        // Nulo apaga a escolha em vez de gravar uma vazia: assim "sem escolha"
        // continua sendo um estado possivel do projeto, e nao algo que so existe
        // enquanto ninguem abriu a tela.
        if (dto.StatePublicId is null)
        {
            if (atual is not null)
            {
                await _unitOfWork.ProjectInitialStates.SoftDeleteAsync(atual, cancellationToken);
                await _unitOfWork.CommitAsync(cancellationToken);
            }

            return new ProjectInitialStateViewModel(tipo, null);
        }

        var state = await _unitOfWork.ProjectStates.GetByPublicIdAsync(dto.StatePublicId.Value, cancellationToken);

        if (state is null || state.ProjectId != project.Id)
            throw new KeyNotFoundException("Estado nao encontrado neste projeto.");

        // Mandar relato novo para um estado aposentado seria desfazer pela porta dos
        // fundos o que aposentar decidiu.
        if (!state.IsActive)
            throw new ConflictException("Este estado esta aposentado e nao recebe relato novo.");

        if (atual is null)
        {
            await _unitOfWork.ProjectInitialStates.AddAsync(new ProjectInitialState
            {
                ProjectId = project.Id,
                ReportType = tipo,
                ProjectStateId = state.Id,
            }, cancellationToken);
        }
        else
        {
            atual.ProjectStateId = state.Id;
            _unitOfWork.ProjectInitialStates.Update(atual);
        }

        await _unitOfWork.CommitAsync(cancellationToken);

        return new ProjectInitialStateViewModel(tipo, state.PublicId);
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
