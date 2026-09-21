using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ReporterCodeRepository : BaseRepository<ReporterCode, DataContext>, IReporterCodeRepository
{
    public ReporterCodeRepository(DataContext context) : base(context)
    {
    }

    public Task<ReporterCode?> FindByCodeWithoutSessionAsync(long projectId, string code, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a da conta — o mesmo
        // desenho da chave publica e do relato pelo protocolo.
        => Context.ReporterCodes
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(entrada => entrada.ProjectId == projectId
                                            && entrada.Code == code
                                            && entrada.DeletedAt == null
                                            && entrada.Project.DeletedAt == null,
                cancellationToken);

    public Task<bool> ExistsAsync(long projectId, string code, CancellationToken cancellationToken = default)
        // Inclui o apagado logicamente, ao contrario da consulta acima. Reaproveitar
        // um codigo que ja foi de alguem faria a lista de uma pessoa aparecer para
        // outra — e o papel com o codigo antigo continua na mao de alguem.
        => Context.ReporterCodes
            .IgnoreQueryFilters()
            .AnyAsync(entrada => entrada.ProjectId == projectId && entrada.Code == code, cancellationToken);
}
