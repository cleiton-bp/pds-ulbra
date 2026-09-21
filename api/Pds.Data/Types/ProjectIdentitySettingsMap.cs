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

        builder.Property(settings => settings.Visibility)
            .HasColumnName("visibility")
            .HasConversion(new SnakeCaseEnumConverter<ReportVisibilityEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("private, public_anonymous ou public_identified. Padrao private. public_identified so vale onde o modo identifica — sem identidade nao ha o que mostrar. Gravar publico nao publica nada sozinho: a lista publica so existe atras da fila de moderacao.");

        builder.Property(settings => settings.AsksForName)
            .HasColumnName("asks_for_name")
            .IsRequired()
            .HasComment("A ferramenta pergunta o nome de quem relata. Desligado de fabrica: coletar dado pessoal precisa ser um ato de quem configura. Perguntar nao e publicar — o nome so sai la fora com visibility = public_identified E o relato assinado pela propria pessoa.");

        // Uma linha por projeto. Parcial, para o projeto apagado logicamente nao
        // segurar o lugar de uma configuracao nova.
        builder.HasIndex(settings => settings.ProjectId)
            .IsUnique()
            .HasFilter("deleted_at IS NULL");
    }
}
