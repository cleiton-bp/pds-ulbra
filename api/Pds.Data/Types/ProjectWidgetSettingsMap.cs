using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectWidgetSettingsMap : BaseEntityConfiguration<ProjectWidgetSettings>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectWidgetSettings> builder)
    {
        builder.ToTable("project_widget_settings", table =>
        {
            table.HasComment(
                "Como a ferramenta de relato aparece no site de um projeto. Uma linha por projeto, criada so quando alguem salva: os padroes vivem no codigo, e projeto sem linha e projeto que nunca precisou mudar nada.");
        });

        builder.Property(settings => settings.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto a que esta configuracao pertence.");

        builder.Property(settings => settings.IsEnabled)
            .HasColumnName("is_enabled")
            .IsRequired()
            .HasDefaultValue(true)
            .HasComment("Desliga a ferramenta no site inteiro sem ninguem editar o HTML do cliente.");

        builder.Property(settings => settings.AccentColor)
            .HasColumnName("accent_color")
            .HasMaxLength(ProjectWidgetSettings.MaxAccentColorLength)
            .HasComment("Cor do gatilho em #rrggbb. Nulo quer dizer o acento do proprio produto, que acompanha o tema.");

        builder.Property(settings => settings.Position)
            .HasColumnName("position")
            .HasConversion(new SnakeCaseEnumConverter<WidgetPositionEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("bottom_right | bottom_left. De que canto inferior a ferramenta sai.");

        builder.Property(settings => settings.Theme)
            .HasColumnName("theme")
            .HasConversion(new SnakeCaseEnumConverter<WidgetThemeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("auto | light | dark. Auto segue o sistema de quem visita o site do cliente.");

        builder.Property(settings => settings.LauncherLabel)
            .HasColumnName("launcher_label")
            .HasMaxLength(ProjectWidgetSettings.MaxLauncherLabelLength)
            .IsRequired()
            .HasComment("O texto dentro do gatilho, o botao que fica parado na pagina.");

        builder.Property(settings => settings.Title)
            .HasColumnName("title")
            .HasMaxLength(ProjectWidgetSettings.MaxTitleLength)
            .IsRequired()
            .HasComment("O titulo dentro do quadro. Nunca o nome do projeto, que e nome interno.");

        builder.Property(settings => settings.Placeholder)
            .HasColumnName("placeholder")
            .HasMaxLength(ProjectWidgetSettings.MaxPlaceholderLength)
            .IsRequired()
            .HasComment("O texto cinza da caixa vazia. E ele que faz a pergunta certa.");

        builder.Property(settings => settings.SuccessMessage)
            .HasColumnName("success_message")
            .HasMaxLength(ProjectWidgetSettings.MaxSuccessMessageLength)
            .IsRequired()
            .HasComment("A frase acima do protocolo, na confirmacao.");

        builder.Property(settings => settings.ShowsTypeField)
            .HasColumnName("shows_type_field")
            .IsRequired()
            .HasDefaultValue(true)
            .HasComment("Mostra ou esconde o seletor de tipo no formulario.");

        builder.Property(settings => settings.DefaultReportType)
            .HasColumnName("default_report_type")
            .HasConversion(new SnakeCaseEnumConverter<ReportTypeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("bug | improvement | question. Vem pre-marcado, e e o tipo gravado quando o seletor esta escondido.");

        // Uma linha por projeto. O filtro deixa de fora o que foi apagado: sem ele,
        // um projeto apagado logicamente e recriado esbarraria numa linha invisivel.
        builder.HasIndex(settings => settings.ProjectId)
            .IsUnique()
            .HasFilter("deleted_at IS NULL");
    }
}
