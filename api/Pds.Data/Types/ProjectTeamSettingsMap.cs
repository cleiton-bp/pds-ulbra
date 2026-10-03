using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ProjectTeamSettingsMap : BaseEntityConfiguration<ProjectTeamSettings>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectTeamSettings> builder)
    {
        builder.ToTable("project_team_settings", table =>
        {
            table.HasComment(
                "Como o time trabalha neste projeto: por enquanto, o prazo do convite. Uma linha por projeto, criada so quando alguem salva — os padroes vivem no codigo, e projeto sem linha e projeto que nunca precisou mudar nada.");

            table.HasCheckConstraint(
                "ck_project_team_settings_invitation_validity",
                $"invitation_validity_days >= {ProjectTeamSettings.MinInvitationValidityDays} AND invitation_validity_days <= {ProjectTeamSettings.MaxInvitationValidityDays}");
        });

        builder.Property(settings => settings.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1.");

        builder.Property(settings => settings.InvitationValidityDays)
            .HasColumnName("invitation_validity_days")
            .IsRequired()
            .HasComment("Por quantos dias um convite vale, a contar do envio. De 1 a 30; padrao 7.");

        // Uma linha por projeto. Parcial, para o projeto apagado logicamente nao
        // segurar o lugar de uma configuracao nova.
        builder.HasIndex(settings => settings.ProjectId)
            .IsUnique()
            .HasFilter("deleted_at IS NULL");
    }
}
