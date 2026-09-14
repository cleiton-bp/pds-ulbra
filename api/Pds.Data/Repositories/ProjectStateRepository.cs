using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectStateRepository : BaseRepository<ProjectState, DataContext>, IProjectStateRepository
{
    public ProjectStateRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectState>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        // O desempate pelo identificador nao e detalhe: a posicao nao e unica, e
        // sem ele dois estados na mesma posicao trocariam de lugar entre uma
        // leitura e outra, sem ninguem ter mexido em nada.
        => await Context.ProjectStates
            .Where(state => state.ProjectId == projectId)
            .OrderBy(state => state.Position)
            .ThenBy(state => state.Id)
            .ToListAsync(cancellationToken);

    public Task<bool> NameExistsAsync(long projectId, string name, long? exceptId = null, CancellationToken cancellationToken = default)
        // ToLower() vira lower() no Postgres. E a unica comparacao do sistema que
        // ignora caixa, porque aqui o texto e escrito por uma pessoa e nao
        // normalizado antes de gravar — o nome vai para a tela do jeito que foi
        // digitado, entao nao da para guarda-lo em minusculo como o dominio.
        => Context.ProjectStates
            .AnyAsync(state => state.ProjectId == projectId
                               && state.Name.ToLower() == name.ToLower()
                               && (exceptId == null || state.Id != exceptId),
                cancellationToken);

    public Task<ProjectState?> FirstActiveWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default)
        // Mesmo desempate da listagem: a posicao nao e unica, e sem ele o destino
        // padrao do relato mudaria entre uma entrada e outra sem ninguem ter mexido
        // na fila.
        => Context.ProjectStates
            .IgnoreQueryFilters()
            .Where(state => state.ProjectId == projectId
                            && state.DeletedAt == null
                            && state.DeactivatedAt == null
                            && state.Project.DeletedAt == null)
            .OrderBy(state => state.Position)
            .ThenBy(state => state.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<int?> LastPositionAsync(long projectId, CancellationToken cancellationToken = default)
        // MaxAsync direto quebraria na fila vazia, que e justamente o estado de
        // todo projeto ate alguem criar o primeiro.
        => await Context.ProjectStates
            .Where(state => state.ProjectId == projectId)
            .Select(state => (int?)state.Position)
            .MaxAsync(cancellationToken);
}
