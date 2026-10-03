using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectLabelMap : BaseEntityConfiguration<ProjectLabel>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectLabel> builder)
    {
        builder.ToTable("project_labels", table =>
        {
            table.HasComment(
                "As etiquetas de cada projeto. O time cria ao etiquetar um card; o administrador renomeia, troca a cor e apaga. Apagar tira a etiqueta de todos os cards; os eventos guardam o nome da epoca.");
        });

        builder.Property(label => label.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono da etiqueta.");

        builder.Property(label => label.Name)
            .HasColumnName("name")
            .HasMaxLength(ProjectLabel.MaxNameLength)
            .IsRequired()
            .HasComment("O nome. Unico no projeto, sem diferenciar maiuscula de minuscula (conferido no servico).");

        builder.Property(label => label.Color)
            .HasColumnName("color")
            .HasConversion(new SnakeCaseEnumConverter<CardColorEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("gray | blue | green | yellow | orange | red | purple | pink. Paleta fixa, como a da prioridade.");

        builder.HasIndex(label => new { label.ProjectId, label.Name })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        builder.HasIndex(label => label.ProjectId);
    }
}
