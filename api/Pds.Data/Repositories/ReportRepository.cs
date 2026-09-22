using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Filters;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ReportRepository : BaseRepository<Report, DataContext>, IReportRepository
{
    public ReportRepository(DataContext context) : base(context)
    {
    }

    public Task<bool> TrackingCodeExistsAsync(string trackingCode, CancellationToken cancellationToken = default)
        // Inclui o que foi apagado de proposito: a linha some da lista, mas o papel
        // com o protocolo continua na mao de alguem, e reaproveitar o codigo faria
        // duas pessoas diferentes digitarem o mesmo.
        => Context.Reports
            .IgnoreQueryFilters()
            .AnyAsync(report => report.TrackingCode == trackingCode, cancellationToken);

    public Task<Report?> FindByTrackingCodeWithoutSessionAsync(string trackingCode, CancellationToken cancellationToken = default)
        // Sem `DeletedAt == null`, e de proposito: o link de quem relatou continua
        // valendo depois de o relato sair da lista do painel.
        //
        // **E uma das seis que dispensam essa condicao**, entre as vinte e quatro
        // consultas que atravessam o filtro. As outras dezoito reescrevem
        // `DeletedAt == null` a mao, que e o que o filtro dava.
        //
        // Das seis, cinco dispensam pelo mesmo motivo: o que saiu da lista do
        // painel continua valendo para quem tem o papel na mao — o protocolo, o
        // link ou o codigo. Sao a conferencia de protocolo repetido, oito linhas
        // acima; esta; as duas que a fila usa para reavaliar relato agendado; e a
        // conferencia de colisao do codigo pessoal. A sexta nao precisa: evento nao
        // se apaga, entao nao ha exclusao logica para repor.
        //
        // A diferenca desta para a conferencia de protocolo e o que importa: aquela
        // devolve um sim/nao, e esta devolve **conteudo** a quem apresenta um token.
        //
        // O projeto vem junto porque **tres** rotas publicas precisam dele: abrir
        // usa a jornada, e confirmar e reabrir precisam da conta e da versao do
        // mapa para gravar evento. Uma juncao a mais por abertura custa menos do que
        // uma segunda ida ao banco em cada uma delas.
        //
        // E a coluna atual vem junto **porque a reabertura grava de onde o relato
        // saiu**. Sem ela o evento nasce com a origem em branco, e o historico do
        // painel passa a dizer "colocado em Analise" sobre um relato que estava em
        // outra coluna havia semanas — uma linha que descreve um caminho que ninguem
        // percorreu. Nao da erro em lugar nenhum: so mente.
        => Context.Reports
            .IgnoreQueryFilters()
            .Include(report => report.Project)
            .Include(report => report.ProjectState)
            .FirstOrDefaultAsync(report => report.TrackingCode == trackingCode, cancellationToken);

    public async Task<IReadOnlyList<Report>> ListByProjectAsync(long projectId, ReportStateFilter filter, int skip, int take, CancellationToken cancellationToken = default)
        // O filtro global ja isola por conta e esconde o que foi apagado; aqui so
        // resta escolher o projeto e o recorte. O Id no fim desempata os relatos do
        // mesmo instante, que sem isso trocariam de lugar entre uma pagina e a
        // seguinte.
        //
        // O estado vem por Include porque a lista mostra o nome da coluna: sem ele,
        // a tela teria de buscar os estados a parte e cruzar a mao, e um relato
        // parado numa coluna aposentada ficaria sem nome nenhum.
        => await Context.Reports
            .Include(report => report.ProjectState)
            .Include(report => report.ProjectPublicStage)
            .Where(report => report.ProjectId == projectId)
            .Where(Recorte(filter))
            .OrderByDescending(report => report.CreatedAt)
            .ThenByDescending(report => report.Id)
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);

    public Task<int> CountByProjectAsync(long projectId, ReportStateFilter filter, CancellationToken cancellationToken = default)
        => Context.Reports
            .Where(report => report.ProjectId == projectId)
            .Where(Recorte(filter))
            .CountAsync(cancellationToken);

    public async Task<IReadOnlyList<ReportStateCount>> CountByStateAsync(long projectId, CancellationToken cancellationToken = default)
    {
        // Comeca pelos estados, e nao por um agrupamento dos relatos: agrupar so
        // devolveria as colunas que tem relato, e a coluna vazia sumiria do filtro
        // no dia em que o ultimo relato dela fosse movido.
        var porEstado = await Context.ProjectStates
            .Where(state => state.ProjectId == projectId)
            .OrderBy(state => state.Position)
            .ThenBy(state => state.Id)
            .Select(state => new ReportStateCount(
                state.Id,
                state.PublicId,
                state.Name,
                state.DeactivatedAt == null,
                Context.Reports.Count(report => report.ProjectStateId == state.Id)))
            .ToListAsync(cancellationToken);

        // A linha dos que nao tem lugar na fila. Sem ela, a soma das colunas nao
        // bateria com o total e ninguem saberia por que.
        var semEstado = await Context.Reports
            .CountAsync(report => report.ProjectId == projectId && report.ProjectStateId == null,
                cancellationToken);

        return semEstado == 0
            ? porEstado
            : [.. porEstado, new ReportStateCount(null, null, null, true, semEstado)];
    }

    /// <summary>
    /// Traduz o recorte para a condicao. Os dois nulos do filtro decidem coisas
    /// opostas aqui, e e o unico lugar do sistema onde isso acontece.
    /// </summary>
    private static System.Linq.Expressions.Expression<Func<Report, bool>> Recorte(ReportStateFilter filter)
        => filter switch
        {
            { Restricted: false } => _ => true,
            { StateId: null } => report => report.ProjectStateId == null,
            { StateId: var stateId } => report => report.ProjectStateId == stateId,
        };

    public Task<Report?> GetByPublicIdWithContextsAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default)
        // O estado vem junto porque a tela de detalhe diz em que coluna o relato
        // esta — e e de la que ele vai ser movido.
        => Context.Reports
            .Include(report => report.Contexts)
            .Include(report => report.ProjectState)
            .Include(report => report.ProjectPublicStage)
            .FirstOrDefaultAsync(report => report.ProjectId == projectId && report.PublicId == publicId,
                cancellationToken);

    public Task<Report?> FindByPublicIdWithoutSessionAsync(Guid publicId, CancellationToken cancellationToken = default)
        // Sem `DeletedAt == null`, como a busca por protocolo: o agendamento de um
        // relato que saiu da lista do painel continua valendo, e descartar aqui
        // deixaria quem o escreveu sem a noticia que ja estava a caminho.
        => Context.Reports
            .IgnoreQueryFilters()
            .Include(report => report.Project)
            .Include(report => report.ProjectState)
            .FirstOrDefaultAsync(report => report.PublicId == publicId, cancellationToken);

    public async Task<IReadOnlyList<Report>> ListByReporterCodeWithoutSessionAsync(long reporterCodeId, int limit, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a da conta. O
        // `Include` da etapa publica existe porque a lista mostra em que passo cada
        // relato esta.
        //
        // **O `Take` nao e detalhe de desempenho.** A rota e publica e nao pede
        // credencial: sem teto, o custo da resposta cresceria com o uso de quem a
        // pede. Quem chama pede um a mais do que vai mostrar, e e assim que sabe
        // dizer que ha mais sem contar quantos.
        => await Context.Reports
            .IgnoreQueryFilters()
            .Include(report => report.ProjectPublicStage)
            .Where(report => report.ReporterCodeId == reporterCodeId
                             && report.DeletedAt == null
                             && report.Project.DeletedAt == null)
            .OrderByDescending(report => report.CreatedAt)
            .ThenByDescending(report => report.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Report>> ListByModerationStateAsync(long projectId, ReportModerationStateEnum state, int limit, CancellationToken cancellationToken = default)
        // O filtro global ja isola a conta e esconde o apagado. A ordem e a unica
        // do painel que vai do mais antigo para o mais novo: fila lida ao
        // contrario deixa o primeiro que chegou esperando para sempre.
        => await Context.Reports
            .Where(report => report.ProjectId == projectId && report.ModerationState == state)
            .Include(report => report.ModeratedByUser)
            .OrderBy(report => report.CreatedAt)
            .ThenBy(report => report.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

    public Task<int> CountByModerationStateAsync(long projectId, ReportModerationStateEnum state, CancellationToken cancellationToken = default)
        => Context.Reports
            .CountAsync(report => report.ProjectId == projectId && report.ModerationState == state,
                cancellationToken);

    public async Task<IReadOnlyList<Report>> ListPublishedWithoutSessionAsync(long projectId, int limit, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a da conta — e a de
        // estar liberado **dentro da consulta**, para o relato pendente nunca chegar
        // a sair daqui.
        //
        // Ordena por `moderated_at`, e nao por `created_at`: a lista publica conta o
        // que o time acabou de liberar, e relato antigo liberado hoje e novidade
        // para quem esta lendo.
        => await Context.Reports
            .IgnoreQueryFilters()
            .Include(report => report.ProjectPublicStage)
            .Where(report => report.ProjectId == projectId
                             && report.ModerationState == ReportModerationStateEnum.Approved
                             && report.DeletedAt == null
                             && report.Project.DeletedAt == null)
            .OrderByDescending(report => report.ModeratedAt)
            .ThenByDescending(report => report.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Guid>> ListOverduePublicStageWithoutSessionAsync(DateTime now, CancellationToken cancellationToken = default)
        // So os identificadores publicos: quem chama vai reabrir cada um no proprio
        // escopo, e carregar as entidades aqui manteria vivo um contexto inteiro
        // durante a reavaliacao de todos eles.
        => await Context.Reports
            .IgnoreQueryFilters()
            .Where(report => report.PublicStageDueAt != null && report.PublicStageDueAt <= now)
            .OrderBy(report => report.PublicStageDueAt)
            .Select(report => report.PublicId)
            .ToListAsync(cancellationToken);
}
