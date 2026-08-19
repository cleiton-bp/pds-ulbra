using System.Linq.Expressions;
using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query;
using Pds.Domain.Entities;

namespace Pds.Data.Context;

/// <summary>
/// Contexto base. Cuida das tres coisas que valem para toda tabela e que ninguem
/// deveria precisar lembrar de fazer: esconder o que foi apagado, preencher as
/// datas de auditoria e sortear o identificador publico.
/// </summary>
public abstract class PdsBaseContext : DbContext
{
    protected PdsBaseContext(DbContextOptions options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(Assembly.GetAssembly(GetType())!);

        base.OnModelCreating(modelBuilder);

        // Filtro global de exclusao logica. Aplicado aqui, e nao em cada consulta,
        // porque esquecer uma vez faz dado apagado reaparecer na tela.
        foreach (var entityType in modelBuilder.Model.GetEntityTypes()
                     .Where(entity => typeof(PdsBaseEntity).IsAssignableFrom(entity.ClrType)))
        {
            Expression<Func<PdsBaseEntity, bool>> filter = entity => entity.DeletedAt == null;
            modelBuilder.Entity(entityType.ClrType)
                .HasQueryFilter(ConvertFilter(filter, entityType.ClrType));
        }

        ApplySnakeCaseNaming(modelBuilder);
    }

    /// <summary>
    /// Renomeia chave, chave estrangeira e indice para snake_case.
    ///
    /// As colunas e tabelas ja saem certas porque cada mapeamento diz o nome. Chave
    /// e indice, nao: o EF batiza sozinho, em PascalCase (<c>IX_accounts_deleted_at</c>).
    /// Como a convencao do projeto vale para indice e constraint tambem, e mais
    /// seguro derivar o nome aqui do que confiar em alguem lembrar de escrever um a
    /// um — bastaria esquecer um indice para o banco ficar com dois padroes.
    /// </summary>
    private static void ApplySnakeCaseNaming(ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            var table = entityType.GetTableName();
            if (string.IsNullOrEmpty(table))
                continue;

            foreach (var key in entityType.GetKeys())
                key.SetName($"pk_{table}");

            foreach (var foreignKey in entityType.GetForeignKeys())
            {
                var principal = foreignKey.PrincipalEntityType.GetTableName();
                var columns = string.Join('_', foreignKey.Properties.Select(property => property.GetColumnName()));
                foreignKey.SetConstraintName($"fk_{table}_{principal}_{columns}");
            }

            foreach (var index in entityType.GetIndexes())
            {
                var columns = string.Join('_', index.Properties.Select(property => property.GetColumnName()));
                index.SetDatabaseName($"{(index.IsUnique ? "ux" : "ix")}_{table}_{columns}");
            }
        }
    }

    /// <summary>Reescreve a expressao generica de filtro para o tipo concreto da entidade.</summary>
    protected static LambdaExpression ConvertFilter<TEntity>(Expression<Func<TEntity, bool>> filter, Type entityType)
    {
        var parameter = Expression.Parameter(entityType);
        var body = ReplacingExpressionVisitor.Replace(filter.Parameters.Single(), parameter, filter.Body);
        return Expression.Lambda(body, parameter);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        ApplyAuditAndPublicId();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ApplyAuditAndPublicId();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    /// <summary>
    /// Preenche datas de auditoria e o identificador publico no momento de gravar.
    ///
    /// O GUID nasce aqui, e nao em quem cria a entidade, porque isso o torna uma
    /// garantia em vez de um combinado: nenhuma linha entra no banco sem
    /// identificador publico, mesmo que o codigo que a criou tenha esquecido.
    /// </summary>
    private void ApplyAuditAndPublicId()
    {
        var now = DateTime.UtcNow;

        foreach (var entry in ChangeTracker.Entries<PdsBaseEntity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    if (entry.Entity.PublicId == Guid.Empty)
                        entry.Entity.PublicId = Guid.NewGuid();

                    if (entry.Entity.CreatedAt == default)
                        entry.Entity.CreatedAt = now;

                    entry.Entity.UpdatedAt = entry.Entity.CreatedAt;
                    break;

                case EntityState.Modified:
                    // Data de criacao nao se altera, mesmo que alguem tente.
                    entry.Property(entity => entity.CreatedAt).IsModified = false;
                    entry.Property(entity => entity.PublicId).IsModified = false;
                    entry.Entity.UpdatedAt = now;
                    break;
            }
        }
    }
}
