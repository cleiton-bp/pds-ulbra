using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ReportContextMap : BaseEntityConfiguration<ReportContext>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ReportContext> builder)
    {
        builder.ToTable("report_contexts", table =>
        {
            table.HasComment(
                "O que veio junto com o relato sem ninguem digitar. Tabela separada em vez de colunas em reports porque o que se vai querer saber amanha ainda nao esta decidido hoje.");
        });

        builder.Property(context => context.ReportId)
            .HasColumnName("report_id")
            .IsRequired()
            .HasComment("Relato a que este dado pertence.");

        builder.Property(context => context.Key)
            .HasColumnName("key")
            .HasMaxLength(60)
            .IsRequired()
            .HasComment("Nome do dado em ingles e snake_case, como user_agent ou viewport_width.");

        builder.Property(context => context.Value)
            .HasColumnName("value")
            .HasMaxLength(1000)
            .HasComment("O valor como chegou, sempre texto. A interpretacao fica com quem le.");

        // O mesmo dado nao entra duas vezes no relato. O filtro deixa de fora o que
        // foi apagado, como nas demais unicidades do sistema.
        builder.HasIndex(context => new { context.ReportId, context.Key })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");
    }
}
