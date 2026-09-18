using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectPublicStageRepository : BaseRepository<ProjectPublicStage, DataContext>, IProjectPublicStageRepository
{
    public ProjectPublicStageRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectPublicStage>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        // O desempate pelo identificador e o mesmo da fila de trabalho: a posicao
        // nao e unica, e sem ele duas etapas na mesma posicao trocariam de lugar
        // entre uma leitura e outra, sem ninguem ter mexido em nada.
        => await Context.ProjectPublicStages
            .Where(stage => stage.ProjectId == projectId)
            .OrderBy(stage => stage.Position)
            .ThenBy(stage => stage.Id)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<ProjectPublicStage>> ListByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a da conta — o mesmo
        // desenho da busca da chave publica e da do endereco autorizado.
        => await Context.ProjectPublicStages
            .IgnoreQueryFilters()
            .Where(stage => stage.ProjectId == projectId
                            && stage.DeletedAt == null
                            && stage.Project.DeletedAt == null)
            .OrderBy(stage => stage.Position)
            .ThenBy(stage => stage.Id)
            .ToListAsync(cancellationToken);

    public Task<bool> LabelExistsAsync(long projectId, string label, long? exceptId = null, CancellationToken cancellationToken = default)
        // ToLower() vira lower() no Postgres. Ignora caixa pelo mesmo motivo do nome
        // do estado: o texto e escrito por uma pessoa e vai para a tela do jeito que
        // foi digitado, entao nao da para guarda-lo em minusculo.
        => Context.ProjectPublicStages
            .AnyAsync(stage => stage.ProjectId == projectId
                               && stage.Label.ToLower() == label.ToLower()
                               && (exceptId == null || stage.Id != exceptId),
                cancellationToken);

    public Task<int> CountByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.ProjectPublicStages
            .CountAsync(stage => stage.ProjectId == projectId, cancellationToken);

    public async Task<int?> LastPositionAsync(long projectId, CancellationToken cancellationToken = default)
        // MaxAsync direto quebraria na jornada vazia, que e o estado de todo projeto
        // criado antes desta tabela existir.
        => await Context.ProjectPublicStages
            .Where(stage => stage.ProjectId == projectId)
            .Select(stage => (int?)stage.Position)
            .MaxAsync(cancellationToken);
}
