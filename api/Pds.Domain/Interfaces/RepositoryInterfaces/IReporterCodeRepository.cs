using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>Os codigos pessoais de um projeto.</summary>
public interface IReporterCodeRepository : IBaseRepository<ReporterCode>
{
    /// <summary>
    /// O codigo, para quem chega <b>sem sessao</b> — que e sempre quem o digita.
    ///
    /// <para><b>Devolve nulo para codigo que nao existe, e quem chama nao pode
    /// contar isso a ninguem.</b> Esta e a unica consulta do sistema cujo resultado
    /// negativo precisa ser indistinguivel do positivo vazio: responder "nao
    /// encontrado" transformaria a rota num oraculo, e tentar codigos ate a resposta
    /// mudar e exatamente como se enumera.</para>
    /// </summary>
    Task<ReporterCode?> FindByCodeWithoutSessionAsync(long projectId, string code, CancellationToken cancellationToken = default);

    /// <summary>
    /// Se um codigo ja existe neste projeto. <b>So para a gravacao</b>, que trata
    /// colisao com nova tentativa — nunca para responder a alguem.
    /// </summary>
    Task<bool> ExistsAsync(long projectId, string code, CancellationToken cancellationToken = default);
}
