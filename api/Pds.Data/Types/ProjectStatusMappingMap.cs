using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ProjectStatusMappingMap : BaseEntityConfiguration<ProjectStatusMapping>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectStatusMapping> builder)
    {
        builder.ToTable("project_status_mappings", table =>
        {
            table.HasComment(
                "Liga N estados de dentro a 1 etapa de fora. Versionada: alterar grava o conjunto inteiro de novo, um numero acima, porque reescrever o mapa apagaria o sentido de tudo que ja aconteceu.");
        });

        builder.Property(mapping => mapping.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono. Repetido aqui porque toda consulta comeca por projeto e versao.");

        builder.Property(mapping => mapping.ProjectStateId)
            .HasColumnName("project_state_id")
            .IsRequired()
            .HasComment("O estado de dentro, de onde o relato sai.");

        builder.Property(mapping => mapping.ProjectPublicStageId)
            .HasColumnName("project_public_stage_id")
            .IsRequired()
            .HasComment("A etapa de fora, onde quem relatou passa a ver o relato.");

        builder.Property(mapping => mapping.Version)
            .HasColumnName("version")
            .IsRequired()
            .HasComment("A versao a que esta linha pertence. A que vale agora e projects.mapping_version.");

        // O estado aparece uma vez so dentro de uma versao. E o que impede N:N pela
        // porta dos fundos: duas linhas para o mesmo estado deixariam a traducao sem
        // resposta para "onde este relato esta agora".
        builder.HasIndex(mapping => new { mapping.ProjectId, mapping.Version, mapping.ProjectStateId })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // A leitura e sempre "o mapa desta versao deste projeto", inteiro.
        builder.HasIndex(mapping => new { mapping.ProjectId, mapping.Version });

        // Restrict nos dois lados. A etapa publica se remove, e o estado interno se
        // aposenta — mas nenhum dos dois pode levar junto uma versao antiga do mapa,
        // porque e ela que explica a linha do tempo ja percorrida.
        builder.HasOne(mapping => mapping.ProjectState)
            .WithMany()
            .HasForeignKey(mapping => mapping.ProjectStateId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(mapping => mapping.ProjectPublicStage)
            .WithMany()
            .HasForeignKey(mapping => mapping.ProjectPublicStageId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
