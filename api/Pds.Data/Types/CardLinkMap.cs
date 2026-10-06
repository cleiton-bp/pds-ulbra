using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class CardLinkMap : BaseEntityConfiguration<CardLink>
{
    protected override void ConfigureEntity(EntityTypeBuilder<CardLink> builder)
    {
        builder.ToTable("card_links", table =>
        {
            table.HasComment(
                "Os vinculos entre cards do mesmo projeto: duplicado de, bloqueia, relacionado a. Um por par de cards. Interno: nenhuma rota publica le esta tabela.");

            table.HasCheckConstraint("ck_card_links_type", "type IN ('duplicate_of', 'blocks', 'relates_to')");

            // Ninguem se vincula a si mesmo.
            table.HasCheckConstraint("ck_card_links_not_self", "from_report_id <> to_report_id");
        });

        builder.Property(link => link.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("O projeto dos dois cards, repetido para o filtro de acesso nao precisar de juncao.");

        builder.Property(link => link.FromReportId)
            .HasColumnName("from_report_id")
            .IsRequired()
            .HasComment("O card de origem: o duplicado, o que bloqueia, ou quem vinculou o relacionado.");

        builder.Property(link => link.ToReportId)
            .HasColumnName("to_report_id")
            .IsRequired()
            .HasComment("O card de destino: o original, o bloqueado, ou o relacionado.");

        builder.Property(link => link.Type)
            .HasColumnName("type")
            .HasConversion(new SnakeCaseEnumConverter<CardLinkTypeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("duplicate_of | blocks | relates_to, na direcao de from_report_id para to_report_id.");

        // Um vinculo por par na mesma direcao; a direcao oposta, o servico confere.
        builder.HasIndex(link => new { link.FromReportId, link.ToReportId })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // Um original por duplicado.
        builder.HasIndex(link => link.FromReportId)
            .IsUnique()
            .HasFilter("deleted_at IS NULL AND type = 'duplicate_of'");

        // A leitura pelo outro lado: os duplicados de um original, os bloqueadores de um card.
        builder.HasIndex(link => link.ToReportId);

        // Restrict: card nao se apaga, e o vinculo nao some debaixo dele.
        builder.HasOne(link => link.FromReport)
            .WithMany()
            .HasForeignKey(link => link.FromReportId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(link => link.ToReport)
            .WithMany()
            .HasForeignKey(link => link.ToReportId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(link => link.Project)
            .WithMany()
            .HasForeignKey(link => link.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
