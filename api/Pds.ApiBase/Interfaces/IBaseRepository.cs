using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore.Query;
using Pds.ApiBase.Entities;

namespace Pds.ApiBase.Interfaces;

/// <summary>
/// Operacoes basicas de leitura e escrita de uma entidade.
///
/// Note que existe <see cref="GetByPublicIdAsync"/> alem do
/// <see cref="GetByIdAsync"/>: a camada de servico trabalha sempre pelo
/// identificador publico, porque e o unico que chega do cliente. O
/// <see cref="GetByIdAsync"/> fica para uso interno, quando o id ja veio do banco.
/// </summary>
public interface IBaseRepository<TEntity> where TEntity : IBaseEntity
{
    /// <summary>Busca pela chave interna. Use apenas com um id que ja veio do banco.</summary>
    Task<TEntity?> GetByIdAsync(long id, CancellationToken cancellationToken = default);

    /// <summary>Busca pelo identificador publico. E o caminho para tudo que vem do cliente.</summary>
    Task<TEntity?> GetByPublicIdAsync(Guid publicId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<TEntity>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<TEntity>> GetAllAsync(
        Expression<Func<TEntity, bool>>? predicate = null,
        Func<IQueryable<TEntity>, IOrderedQueryable<TEntity>>? orderBy = null,
        Func<IQueryable<TEntity>, IIncludableQueryable<TEntity, object>>? include = null,
        bool disableTracking = false,
        int? skip = null,
        int? take = null,
        CancellationToken cancellationToken = default);

    Task<TEntity?> GetOneByAsync(
        Expression<Func<TEntity, bool>> predicate,
        Func<IQueryable<TEntity>, IIncludableQueryable<TEntity, object>>? include = null,
        bool disableTracking = false,
        CancellationToken cancellationToken = default);

    Task<TEntity> AddAsync(TEntity entity, CancellationToken cancellationToken = default);

    TEntity Update(TEntity entity);

    /// <summary>Exclusao logica: preenche <c>deleted_at</c> e propaga aos dependentes marcados.</summary>
    Task SoftDeleteAsync(TEntity entity, CancellationToken cancellationToken = default);

    Task<bool> AnyAsync(Expression<Func<TEntity, bool>> predicate, CancellationToken cancellationToken = default);

    Task<int> CountAsync(Expression<Func<TEntity, bool>>? predicate = null, CancellationToken cancellationToken = default);
}
