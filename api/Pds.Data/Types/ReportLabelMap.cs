using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ReportLabelMap : BaseEntityConfiguration<ReportLabel>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ReportLabel> builder)
    {
        builder.ToTable("report_labels", table =>
        {
            table.HasComment(
                "As etiquetas de cada card, um par por linha. Interno: nenhuma rota publica le esta tabela.");
        });

        builder.Property(link => link.ReportId)
            .HasColumnName("report_id")
            .IsRequired()
            .HasComment("O card etiquetado.");

        builder.Property(link => link.ProjectLabelId)
            .HasColumnName("project_label_id")
            .IsRequired()
            .HasComment("A etiqueta, do mesmo projeto do card.");

        // A mesma etiqueta nao entra duas vezes no mesmo card. O indice tambem
        // atende a leitura das etiquetas de um card, que comeca por ele.
        builder.HasIndex(link => new { link.ReportId, link.ProjectLabelId })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // Apagar a etiqueta tira as linhas dela de todos os cards.
        builder.HasOne(link => link.ProjectLabel)
            .WithMany()
            .HasForeignKey(link => link.ProjectLabelId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
