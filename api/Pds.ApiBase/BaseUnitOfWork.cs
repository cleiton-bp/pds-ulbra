using System.Data;
using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Interfaces;

namespace Pds.ApiBase;

/// <summary>Implementacao base do Unit of Work sobre um <see cref="DbContext"/>.</summary>
public abstract class BaseUnitOfWork : IBaseUnitOfWork
{
    private readonly DbContext _context;

    protected BaseUnitOfWork(DbContext context)
    {
        _context = context;
    }

    public Task<int> CommitAsync(CancellationToken cancellationToken = default)
        => _context.SaveChangesAsync(cancellationToken);

    public Task<T> InTransactionAsync<T>(
        Func<CancellationToken, Task<T>> work,
        CancellationToken cancellationToken = default)
        // Pela estrategia de execucao, e nao direto: hoje ela nao repete nada, mas se
        // um dia repetir em falha de conexao, transacao aberta a mao fora dela passa
        // a ser recusada pelo EF.
        => _context.Database.CreateExecutionStrategy().ExecuteAsync(async ct =>
        {
            // O nivel e dito, e nao herdado do servidor. Em READ COMMITTED cada comando
            // enxerga o que ja foi confirmado ate ele comecar — e e isso que faz quem
            // esperou uma trava contar o que o outro acabou de gravar. Num nivel mais
            // alto a transacao ficaria com a foto do primeiro comando, tirada antes da
            // espera, e a trava deixaria de adiantar.
            await using var transaction = await _context.Database.BeginTransactionAsync(
                IsolationLevel.ReadCommitted, ct);

            var result = await work(ct);

            await transaction.CommitAsync(ct);
            return result;
        }, cancellationToken);

    public void Dispose()
    {
        // O ciclo de vida do DbContext e do container (scoped); nao cabe ao Unit of
        // Work descartar o que nao criou.
        GC.SuppressFinalize(this);
    }
}
