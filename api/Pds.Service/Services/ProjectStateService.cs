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
/// <para><b>Apagar e so para a coluna que nao deixou rastro</b> (ver
/// <see cref="DeleteAsync"/>): a que nunca recebeu card, ou a que e so do time e ja foi
/// desativada. As outras se aposentam (<see cref="DeactivateAsync"/>).</para>
/// </summary>
public class ProjectStateService : IProjectStateService
{
    private readonly IUnitOfWork _unitOfWork;

    /// <summary>
    /// A tela de Trabalho dos outros le esta configuracao: mudou, ela rele. Ver
    /// <see cref="IWorkNotifier"/>.
    /// </summary>
    private readonly IWorkNotifier _notifier;

    public ProjectStateService(IUnitOfWork unitOfWork, IWorkNotifier notifier)
    {
        _notifier = notifier;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<ProjectStateViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var states = await _unitOfWork.ProjectStates.ListByProjectAsync(project.Id, cancellationToken);
        var uso = await LerUsoAsync(project, cancellationToken);

        return states.Select(state => Map(state, uso)).ToList();
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

        await _notifier.ProjectChangedAsync(projectPublicId);

        return Map(state, await LerUsoAsync(project, cancellationToken));
    }

    public async Task<ProjectStateViewModel> RenameAsync(Guid projectPublicId, Guid statePublicId, RenameProjectStateDto dto, CancellationToken cancellationToken = default)
    {
        var (project, state) = await RequireStateAsync(projectPublicId, statePublicId, cancellationToken);
        var name = StateName.Normalize(dto.Name);

        // A excecao e o proprio estado: sem ela, salvar a mesma palavra com um
        // acento corrigido esbarraria no registro que esta sendo editado.
        if (await _unitOfWork.ProjectStates.NameExistsAsync(state.ProjectId, name, state.Id, cancellationToken))
            throw new ConflictException("Este projeto ja tem um estado com este nome.");

        state.Name = name;
        _unitOfWork.ProjectStates.Update(state);
        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.ProjectChangedAsync(projectPublicId);

        return Map(state, await LerUsoAsync(project, cancellationToken));
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
        await _notifier.ProjectChangedAsync(projectPublicId);

        // Devolve na ordem pedida, e nao relendo do banco: e a mesma lista, e uma
        // segunda consulta so daria chance de a tela receber algo diferente do que
        // acabou de ser gravado.
        var uso = await LerUsoAsync(project, cancellationToken);
        return order.Select(publicId => Map(byPublicId[publicId], uso)).ToList();
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
        var (project, state) = await RequireStateAsync(projectPublicId, statePublicId, cancellationToken);

        // Aposentar o que ja esta aposentado nao e erro, e so nao ter o que fazer.
        // Recusar transformaria dois cliques seguidos numa mensagem vermelha.
        if (state.IsActive)
        {
            // Mas aposentar a porta de entrada de um tipo, sim: o relato seguinte
            // daquele tipo cairia num estado aposentado, que e exatamente o que
            // aposentar existe para impedir. A saida e escolher outra coluna no
            // tipo antes, e a mensagem diz isso em vez de so recusar. O tipo
            // desativado conta: reativa-lo traria o problema de volta.
            if (await _unitOfWork.ProjectReportTypes.AnyUsingStateAsync(state.Id, cancellationToken))
            {
                throw new ConflictException(
                    "Este estado e a entrada de algum tipo de relato. Escolha outro destino antes de aposenta-lo.");
            }

            state.DeactivatedAt = DateTime.UtcNow;
            _unitOfWork.ProjectStates.Update(state);
            await _unitOfWork.CommitAsync(cancellationToken);
            await _notifier.ProjectChangedAsync(projectPublicId);
        }

        return Map(state, await LerUsoAsync(project, cancellationToken));
    }

    public async Task<ProjectStateViewModel> ActivateAsync(Guid projectPublicId, Guid statePublicId, CancellationToken cancellationToken = default)
    {
        var (project, state) = await RequireStateAsync(projectPublicId, statePublicId, cancellationToken);

        // Nao ha o que conferir de nome: o repetido e barrado entre todos os
        // estados do projeto, aposentados inclusive, entao voltar nunca colide.
        if (!state.IsActive)
        {
            state.DeactivatedAt = null;
            _unitOfWork.ProjectStates.Update(state);
            await _unitOfWork.CommitAsync(cancellationToken);
            await _notifier.ProjectChangedAsync(projectPublicId);
        }

        return Map(state, await LerUsoAsync(project, cancellationToken));
    }

    /// <summary>
    /// Exclui a coluna que nao deixou rastro.
    ///
    /// <para><b>So quando nada depende dela</b> (ver <see cref="Avaliar"/>): sem card
    /// nenhum, sem ser entrada de tipo nem destino da reabertura, e, se ja recebeu card,
    /// so do time e desativada. O historico dos cards guarda o nome da coluna em cada
    /// movimento, e continua legivel.</para>
    ///
    /// <para><b>Marcada como excluida, e nao apagada da tabela</b>: some de todas as
    /// telas, o nome fica livre para outra coluna, e o "Desfazer" a traz de volta
    /// (<see cref="RestoreAsync"/>). A ligacao com a etapa publica fica guardada junto, e
    /// volta com ela.</para>
    /// </summary>
    public async Task DeleteAsync(Guid projectPublicId, Guid statePublicId, CancellationToken cancellationToken = default)
    {
        var (project, state) = await RequireStateAsync(projectPublicId, statePublicId, cancellationToken);
        var (_, bloqueio) = Avaliar(state, await LerUsoAsync(project, cancellationToken));

        if (bloqueio is not null)
            throw new ConflictException(Motivo(bloqueio.Value));

        state.DeletedAt = DateTime.UtcNow;
        _unitOfWork.ProjectStates.Update(state);
        await _unitOfWork.CommitAsync(cancellationToken);
        await _notifier.ProjectChangedAsync(projectPublicId);
    }

    /// <summary>
    /// O "Desfazer" da exclusao: a coluna volta como estava, na mesma posicao. **Recusado
    /// se outra coluna ja tomou o nome** nesse meio tempo, porque o nome e unico entre as
    /// colunas que existem.
    /// </summary>
    public async Task<ProjectStateViewModel> RestoreAsync(Guid projectPublicId, Guid statePublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var state = await _unitOfWork.ProjectStates.FindDeletedAsync(project.Id, statePublicId, cancellationToken)
                    ?? throw new KeyNotFoundException("Estado nao encontrado neste projeto.");

        if (await _unitOfWork.ProjectStates.NameExistsAsync(project.Id, state.Name, cancellationToken: cancellationToken))
            throw new ConflictException("Ja existe outra coluna com este nome.");

        state.DeletedAt = null;
        _unitOfWork.ProjectStates.Update(state);
        await _unitOfWork.CommitAsync(cancellationToken);
        await _notifier.ProjectChangedAsync(projectPublicId);

        return Map(state, await LerUsoAsync(project, cancellationToken));
    }

    /// <summary>
    /// O que decide se cada coluna pode ser excluida, lido de uma vez para a lista inteira:
    /// as que seguram card, as em que algum card ja entrou, as ligadas a uma etapa
    /// publica, as de entrada de tipo, a da reabertura e quantas estao ativas.
    /// </summary>
    private sealed record Uso(
        IReadOnlySet<long> ComCard,
        IReadOnlySet<Guid> Movidas,
        IReadOnlySet<long> Ligadas,
        IReadOnlySet<long> Entradas,
        long? Reabertura,
        int Ativas);

    private async Task<Uso> LerUsoAsync(Project project, CancellationToken cancellationToken)
    {
        var comCard = await _unitOfWork.Reports.ListStateIdsHoldingAnyAsync(project.Id, cancellationToken);
        var movidas = await _unitOfWork.Events.ListStatesEverEnteredAsync(project.Id, cancellationToken);
        var ligadas = await _unitOfWork.ProjectStatusMappings.ListByVersionAsync(project.Id, project.MappingVersion, cancellationToken);
        var entradas = await _unitOfWork.ProjectReportTypes.ListEntryStateIdsAsync(project.Id, cancellationToken);
        var ciclo = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);
        var ativas = await _unitOfWork.ProjectStates.CountActiveAsync(project.Id, cancellationToken);

        return new Uso(
            comCard.ToHashSet(),
            movidas.ToHashSet(),
            ligadas.Select(ligacao => ligacao.ProjectStateId).ToHashSet(),
            entradas.ToHashSet(),
            ciclo?.ReopenStateId,
            ativas);
    }

    /// <summary>
    /// **Pode excluir** a coluna sem card, que nao e entrada de tipo nem destino da
    /// reabertura, e que nunca recebeu card ou e so do time (sem etapa publica) e ja esta
    /// desativada. A coluna ligada a uma etapa que quem relatou ve, e que ja teve cards, so
    /// se aposenta: a jornada publica dos relatos passou por ela.
    /// </summary>
    private static (bool NuncaUsada, ProjectStateDeleteBlockEnum? Bloqueio) Avaliar(ProjectState state, Uso uso)
    {
        var nuncaUsada = !uso.ComCard.Contains(state.Id) && !uso.Movidas.Contains(state.PublicId);

        ProjectStateDeleteBlockEnum? bloqueio =
            uso.ComCard.Contains(state.Id) ? ProjectStateDeleteBlockEnum.Cards
            : uso.Entradas.Contains(state.Id) ? ProjectStateDeleteBlockEnum.TypeEntry
            : uso.Reabertura == state.Id ? ProjectStateDeleteBlockEnum.ReopenTarget
            : state.IsActive && uso.Ativas <= 1 ? ProjectStateDeleteBlockEnum.OnlyActiveColumn
            : !nuncaUsada && uso.Ligadas.Contains(state.Id) ? ProjectStateDeleteBlockEnum.PublicStage
            : !nuncaUsada && state.IsActive ? ProjectStateDeleteBlockEnum.StillActive
            : null;

        return (nuncaUsada, bloqueio);
    }

    /// <summary>A recusa em texto, para quem chama a rota sem ter lido a lista antes.</summary>
    private static string Motivo(ProjectStateDeleteBlockEnum bloqueio) => bloqueio switch
    {
        ProjectStateDeleteBlockEnum.Cards => "Esta coluna ainda tem cards. Mova os cards antes de excluir.",
        ProjectStateDeleteBlockEnum.TypeEntry => "Este estado e a entrada de algum tipo de relato. Escolha outro destino antes de excluir.",
        ProjectStateDeleteBlockEnum.ReopenTarget => "Esta coluna recebe o relato reaberto. Escolha outra no Encerramento antes de excluir.",
        ProjectStateDeleteBlockEnum.OnlyActiveColumn => "O projeto precisa de pelo menos uma coluna ativa.",
        ProjectStateDeleteBlockEnum.PublicStage => "Esta coluna ja teve cards e mostra uma etapa a quem relatou. Desative em vez de excluir.",
        _ => "Esta coluna ja teve cards. Desative primeiro, e depois exclua.",
    };

    private async Task<(Project Project, ProjectState State)> RequireStateAsync(Guid projectPublicId, Guid statePublicId, CancellationToken cancellationToken)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var state = await _unitOfWork.ProjectStates.GetByPublicIdAsync(statePublicId, cancellationToken);

        // O filtro global ja garante que o estado e de um projeto que a pessoa
        // enxerga, mas nao que e deste: sem esta conferencia, um estado de outro
        // projeto dela seria aceito pela rota errada — e quem e administrador aqui
        // e so membro la mudaria a configuracao de la. Nao e redundante.
        if (state is null || state.ProjectId != project.Id)
            throw new KeyNotFoundException("Estado nao encontrado neste projeto.");

        return (project, state);
    }

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    private static ProjectStateViewModel Map(ProjectState state, Uso uso)
    {
        var (nuncaUsada, bloqueio) = Avaliar(state, uso);
        return new ProjectStateViewModel(
            state.PublicId,
            state.Name,
            state.Position,
            state.IsActive,
            state.CreatedAt,
            nuncaUsada,
            bloqueio is null,
            bloqueio);
    }
}
