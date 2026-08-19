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

    public void Dispose()
    {
        // O ciclo de vida do DbContext e do container (scoped); nao cabe ao Unit of
        // Work descartar o que nao criou.
        GC.SuppressFinalize(this);
    }
}
