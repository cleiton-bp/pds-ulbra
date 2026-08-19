using System.Collections;
using System.Linq.Expressions;
using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query;
using Pds.ApiBase.Attributes;
using Pds.ApiBase.Entities;
using Pds.ApiBase.Interfaces;

namespace Pds.ApiBase.Repositories;

/// <summary>
/// Repositorio generico com o CRUD basico e a exclusao logica. Os repositorios
/// especificos herdam daqui e acrescentam apenas as consultas proprias.
///
/// Nada aqui filtra por conta: o isolamento vive no filtro global do contexto,
/// justamente para nao depender de cada consulta lembrar de aplicar.
/// </summary>
public abstract class BaseRepository<TEntity, TContext> : IBaseRepository<TEntity>
    where TEntity : BaseEntity
    where TContext : DbContext
{
    protected readonly TContext Context;

    protected BaseRepository(TContext context)
    {
        Context = context;
    }

    public virtual Task<TEntity?> GetByIdAsync(long id, CancellationToken cancellationToken = default)
        => Context.Set<TEntity>().FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

    public virtual Task<TEntity?> GetByPublicIdAsync(Guid publicId, CancellationToken cancellationToken = default)
        => Context.Set<TEntity>().FirstOrDefaultAsync(e => e.PublicId == publicId, cancellationToken);

    public virtual async Task<IReadOnlyList<TEntity>> GetAllAsync(CancellationToken cancellationToken = default)
        => await Context.Set<TEntity>().ToListAsync(cancellationToken);

    public virtual async Task<IReadOnlyList<TEntity>> GetAllAsync(
        Expression<Func<TEntity, bool>>? predicate = null,
        Func<IQueryable<TEntity>, IOrderedQueryable<TEntity>>? orderBy = null,
        Func<IQueryable<TEntity>, IIncludableQueryable<TEntity, object>>? include = null,
        bool disableTracking = false,
        int? skip = null,
        int? take = null,
        CancellationToken cancellationToken = default)
    {
        var query = BuildQuery(predicate, orderBy, include, disableTracking, skip, take);
        return await query.ToListAsync(cancellationToken);
    }

    public virtual Task<TEntity?> GetOneByAsync(
        Expression<Func<TEntity, bool>> predicate,
        Func<IQueryable<TEntity>, IIncludableQueryable<TEntity, object>>? include = null,
        bool disableTracking = false,
        CancellationToken cancellationToken = default)
    {
        var query = BuildQuery(predicate, orderBy: null, include: include, disableTracking: disableTracking);
        return query.FirstOrDefaultAsync(cancellationToken);
    }

    public virtual async Task<TEntity> AddAsync(TEntity entity, CancellationToken cancellationToken = default)
    {
        await Context.Set<TEntity>().AddAsync(entity, cancellationToken);
        return entity;
    }

    public virtual TEntity Update(TEntity entity)
    {
        Context.Set<TEntity>().Update(entity);
        return entity;
    }

    public virtual async Task SoftDeleteAsync(TEntity entity, CancellationToken cancellationToken = default)
    {
        await ApplySoftDeleteDependenciesAsync(entity, cancellationToken);

        var now = DateTime.UtcNow;
        entity.DeletedAt = now;
        entity.UpdatedAt = now;
        Context.Set<TEntity>().Update(entity);
    }

    public virtual Task<bool> AnyAsync(Expression<Func<TEntity, bool>> predicate, CancellationToken cancellationToken = default)
        => Context.Set<TEntity>().AnyAsync(predicate, cancellationToken);

    public virtual Task<int> CountAsync(Expression<Func<TEntity, bool>>? predicate = null, CancellationToken cancellationToken = default)
        => predicate is null
            ? Context.Set<TEntity>().CountAsync(cancellationToken)
            : Context.Set<TEntity>().CountAsync(predicate, cancellationToken);

    /// <summary>
    /// Monta o IQueryable aplicando include, filtro, ordenacao, paginacao e tracking.
    /// Fica protegido para os repositorios especificos reaproveitarem.
    /// </summary>
    protected IQueryable<TEntity> BuildQuery(
        Expression<Func<TEntity, bool>>? predicate = null,
        Func<IQueryable<TEntity>, IOrderedQueryable<TEntity>>? orderBy = null,
        Func<IQueryable<TEntity>, IIncludableQueryable<TEntity, object>>? include = null,
        bool disableTracking = false,
        int? skip = null,
        int? take = null)
    {
        IQueryable<TEntity> query = Context.Set<TEntity>();

        if (include is not null)
            query = include(query);

        if (predicate is not null)
            query = query.Where(predicate);

        if (orderBy is not null)
            query = orderBy(query);

        if (skip is not null)
            query = query.Skip(skip.Value);

        if (take is not null)
            query = query.Take(take.Value);

        if (disableTracking)
            query = query.AsNoTracking();

        return query;
    }

    /// <summary>
    /// Propaga (ou barra) a exclusao logica nas navegacoes marcadas com
    /// <see cref="SoftDeleteDependentAttribute"/>.
    /// </summary>
    private async Task ApplySoftDeleteDependenciesAsync(TEntity entity, CancellationToken cancellationToken)
    {
        var dependentProperties = entity.GetType()
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(property => new
            {
                Property = property,
                Attribute = property.GetCustomAttribute<SoftDeleteDependentAttribute>()
            })
            .Where(item => item.Attribute is not null)
            .ToList();

        if (dependentProperties.Count == 0)
            return;

        var entry = Context.Entry(entity);

        foreach (var dependent in dependentProperties)
        {
            var navigation = entry.Metadata.FindNavigation(dependent.Property.Name);
            if (navigation is null)
                continue;

            // Carrega a navegacao antes de decidir: sem isso a colecao vem vazia e
            // o Restrict deixaria passar uma exclusao que deveria barrar.
            if (navigation.IsCollection)
                await entry.Collection(dependent.Property.Name).LoadAsync(cancellationToken);
            else
                await entry.Reference(dependent.Property.Name).LoadAsync(cancellationToken);

            var dependents = ExtractDependents(dependent.Property.GetValue(entity))
                .Where(item => item.DeletedAt is null)
                .ToList();

            if (dependents.Count == 0)
                continue;

            if (dependent.Attribute!.IsRestrict)
            {
                throw new InvalidOperationException(
                    $"Nao e possivel excluir {typeof(TEntity).Name}: ainda existem registros em '{dependent.Property.Name}'.");
            }

            var now = DateTime.UtcNow;
            foreach (var item in dependents)
            {
                item.DeletedAt = now;
                item.UpdatedAt = now;
                Context.Entry(item).State = EntityState.Modified;
            }
        }
    }

    private static IEnumerable<IBaseEntity> ExtractDependents(object? value) => value switch
    {
        null => [],
        IBaseEntity single => [single],
        IEnumerable collection => collection.OfType<IBaseEntity>(),
        _ => []
    };
}
