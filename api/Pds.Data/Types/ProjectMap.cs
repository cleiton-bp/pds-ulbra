using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectMap : BaseEntityConfiguration<Project>
{
    protected override void ConfigureEntity(EntityTypeBuilder<Project> builder)
    {
        builder.ToTable("projects", table => table.HasComment(
            "Projeto: a unidade que o cliente configura e a que identifica de onde veio cada relato."));

        builder.Property(project => project.AccountId)
            .HasColumnName("account_id")
            .IsRequired()
            .HasComment("Conta dona do projeto. E por este campo que o isolamento filtra.");

        builder.Property(project => project.Name)
            .HasColumnName("name")
            .HasMaxLength(120)
            .IsRequired()
            .HasComment("Nome do projeto, unico dentro da conta entre os que nao foram apagados.");

        builder.Property(project => project.Status)
            .HasColumnName("status")
            .HasConversion(new SnakeCaseEnumConverter<ProjectStatusEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("active | archived. Arquivado continua visivel, so para de aceitar coisa nova.");

        // Nome unico por conta, ignorando o que foi apagado: sem o filtro, o nome de
        // um projeto excluido continuaria ocupando o lugar e o cliente nao
        // conseguiria reaproveita-lo.
        builder.HasIndex(project => new { project.AccountId, project.Name })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        builder.HasMany(project => project.Keys)
            .WithOne(key => key.Project)
            .HasForeignKey(key => key.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
