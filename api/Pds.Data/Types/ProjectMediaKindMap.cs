using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectMediaKindMap : BaseEntityConfiguration<ProjectMediaKind>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectMediaKind> builder)
    {
        builder.ToTable("project_media_kinds", table =>
        {
            table.HasComment(
                "Os limites de um tipo de midia, neste projeto. Uma linha por tipo, e e esse o ponto: acrescentar audio um dia e um INSERT, e nao uma migracao. Com uma coluna por tipo, cada tipo novo custaria migracao e toda linha carregaria campos de tipos que aquele projeto nunca ligou.");
        });

        builder.Property(kind => kind.ProjectMediaSettingsId)
            .HasColumnName("project_media_settings_id")
            .IsRequired()
            .HasComment("Configuracao dona da linha. Pendura na configuracao, e nao no projeto, porque sem ela estes limites nao querem dizer nada.");

        builder.Property(kind => kind.Kind)
            .HasColumnName("kind")
            .HasConversion(new SnakeCaseEnumConverter<MediaKindEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("image ou video. Unico por configuracao entre os nao apagados. A lista cresce com o produto, e acrescentar um valor nao mexe em coluna nenhuma.");

        builder.Property(kind => kind.IsEnabled)
            .HasColumnName("is_enabled")
            .IsRequired()
            .HasComment("Este tipo e aceito. Desligar deixa os limites gravados, para religar nao obrigar a reconfigurar o que ja tinha sido pensado.");

        builder.Property(kind => kind.MaxCount)
            .HasColumnName("max_count")
            .IsRequired()
            .HasComment("Quantos arquivos deste tipo cabem num relato.");

        builder.Property(kind => kind.MaxBytes)
            .HasColumnName("max_bytes")
            .IsRequired()
            .HasComment("Teto de tamanho de cada arquivo, em bytes. E este numero que viaja dentro da assinatura do envio, e quem recusa o que passa e o proprio armazenamento — no quadro nao valeria, porque ele roda no navegador de quem relata, e no servidor tambem nao, porque o arquivo nunca passa por la.");

        builder.Property(kind => kind.MaxDurationSeconds)
            .HasColumnName("max_duration_seconds")
            .HasComment("Duracao maxima em segundos, nula para o que nao tem duracao. E a protecao mais barata desta etapa, porque corta armazenamento e exposicao de uma vez.");

        builder.HasOne(kind => kind.ProjectMediaSettings)
            .WithMany(settings => settings.Kinds)
            .HasForeignKey(kind => kind.ProjectMediaSettingsId)
            .OnDelete(DeleteBehavior.Cascade);

        // Um tipo por configuracao. Parcial, para o desligado logicamente nao
        // impedir que o mesmo tipo volte a ser configurado.
        builder.HasIndex(kind => new { kind.ProjectMediaSettingsId, kind.Kind })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");
    }
}
