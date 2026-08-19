namespace Pds.ApiBase.Interfaces;

/// <summary>
/// Contrato base do Unit of Work: confirma, de uma vez, as mudancas pendentes no
/// contexto. E o que permite criar projeto e as duas chaves numa unica gravacao.
/// </summary>
public interface IBaseUnitOfWork : IDisposable
{
    /// <summary>Persiste todas as mudancas pendentes. Devolve o numero de linhas afetadas.</summary>
    Task<int> CommitAsync(CancellationToken cancellationToken = default);
}
