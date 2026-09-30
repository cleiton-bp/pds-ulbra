namespace Pds.ApiBase.Interfaces;

/// <summary>
/// Contrato base do Unit of Work: confirma, de uma vez, as mudancas pendentes no
/// contexto. E o que permite criar projeto e as duas chaves numa unica gravacao.
/// </summary>
public interface IBaseUnitOfWork : IDisposable
{
    /// <summary>Persiste todas as mudancas pendentes. Devolve o numero de linhas afetadas.</summary>
    Task<int> CommitAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Roda <paramref name="work"/> dentro de uma transacao do banco.
    ///
    /// <para><b>Dentro dela, o <c>CommitAsync</c> so grava — quem confirma e o fim
    /// do trabalho.</b> A transacao fecha quando <paramref name="work"/> devolve, e
    /// qualquer excecao desfaz tudo o que ele gravou. Por isso uma recusa que precisa
    /// deixar rastro no banco devolve o motivo em vez de lancar: lancando, o rastro
    /// iria embora junto.</para>
    ///
    /// <para>Existe para o que precisa de uma trava do banco: ela so vale enquanto a
    /// transacao esta aberta. Nao se chama uma dentro da outra — o EF recusa abrir a
    /// segunda transacao no mesmo contexto.</para>
    /// </summary>
    Task<T> InTransactionAsync<T>(
        Func<CancellationToken, Task<T>> work,
        CancellationToken cancellationToken = default);
}
