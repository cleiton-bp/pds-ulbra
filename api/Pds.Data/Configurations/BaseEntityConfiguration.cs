using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Domain.Entities;

namespace Pds.Data.Configurations;

/// <summary>
/// Configuracao comum a todas as tabelas: as quatro colunas padrao mais o
/// identificador publico. Desenhado uma vez aqui para nao precisar repetir — e
/// para nao correr o risco de sair diferente numa tabela.
/// </summary>
public abstract class BaseEntityConfiguration<TEntity> : IEntityTypeConfiguration<TEntity>
    where TEntity : PdsBaseEntity
{
    public void Configure(EntityTypeBuilder<TEntity> builder)
    {
        builder.HasKey(entity => entity.Id);

        builder.Property(entity => entity.Id)
            .HasColumnName("id")
            .UseIdentityByDefaultColumn()
            .HasComment("Chave interna, sequencial. Nunca sai da aplicacao.");

        builder.Property(entity => entity.PublicId)
            .HasColumnName("public_id")
            .IsRequired()
            .HasComment("Identificador publico, GUID aleatorio. E o que aparece em URL e API.");

        builder.Property(entity => entity.CreatedAt)
            .HasColumnName("created_at")
            .IsRequired()
            .HasComment("Criacao do registro, em UTC.");

        builder.Property(entity => entity.UpdatedAt)
            .HasColumnName("updated_at")
            .IsRequired()
            .HasComment("Ultima alteracao, em UTC.");

        builder.Property(entity => entity.DeletedAt)
            .HasColumnName("deleted_at")
            .HasComment("Nulo enquanto o registro vale; preenchido no lugar de apagar.");

        // O identificador publico e unico sempre, inclusive entre os apagados: um
        // GUID sorteado de novo para outro registro quebraria qualquer link antigo.
        builder.HasIndex(entity => entity.PublicId).IsUnique();

        // Quase toda consulta comeca descartando o que foi apagado.
        builder.HasIndex(entity => entity.DeletedAt);

        ConfigureEntity(builder);
    }

    /// <summary>O que e proprio da entidade: tabela, colunas, indices e relacoes.</summary>
    protected abstract void ConfigureEntity(EntityTypeBuilder<TEntity> builder);
}
