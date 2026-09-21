using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectIdentitySettingsMap : BaseEntityConfiguration<ProjectIdentitySettings>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectIdentitySettings> builder)
    {
        builder.ToTable("project_identity_settings", table =>
        {
            table.HasComment(
                "Como quem abre um relato e reconhecido neste projeto, e o que isso permite na visibilidade. Uma linha por projeto, criada so quando alguem salva — os padroes vivem no codigo, e projeto sem linha e projeto que nunca precisou mudar nada.");
        });

        builder.Property(settings => settings.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1.");

        builder.Property(settings => settings.Mode)
            .HasColumnName("mode")
            .HasConversion(new SnakeCaseEnumConverter<ReporterIdentityModeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("protocol, personal_code ou inherited_identity. Excludentes: cada um responde de um jeito diferente a pergunta 'quem e voce'. Trocar de modo nao reescreve o passado — o relato que entrou sem identidade continua abrindo pelo link.");

        // Uma linha por projeto. Parcial, para o projeto apagado logicamente nao
        // segurar o lugar de uma configuracao nova.
        builder.HasIndex(settings => settings.ProjectId)
            .IsUnique()
            .HasFilter("deleted_at IS NULL");
    }
}
