using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IReportRepository : IBaseRepository<Report>
{
    /// <summary>
    /// Este protocolo ja existe? A pergunta vale para o sistema inteiro, e nao para
    /// a conta atual: quem digita o protocolo nao sabe de qual projeto o relato e,
    /// entao dois relatos de contas diferentes com o mesmo codigo levariam a pessoa
    /// ao lugar errado.
    ///
    /// <para>Por isso a consulta atravessa o filtro — e na criacao ela roda sem
    /// sessao nenhuma, quando a conta atual e zero e o filtro nao devolveria nada.</para>
    /// </summary>
    Task<bool> TrackingCodeExistsAsync(string trackingCode, CancellationToken cancellationToken = default);
}
