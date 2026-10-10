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

            // A distancia do canto cabe numa tela de telefone: alem disso nao e canto.
            table.HasCheckConstraint(
                "ck_project_widget_settings_offsets",
                $"offset_x BETWEEN {ProjectWidgetSettings.MinOffset} AND {ProjectWidgetSettings.MaxOffset} AND offset_y BETWEEN {ProjectWidgetSettings.MinOffset} AND {ProjectWidgetSettings.MaxOffset}");

            // Botao so com o icone precisa de um icone — no computador ou so no celular.
            // Sem ele, o canto do site teria um botao vazio que nao diz o que faz.
            table.HasCheckConstraint(
                "ck_project_widget_settings_icon_only",
                "launcher_icon <> 'none' OR (NOT launcher_icon_only AND mobile_mode <> 'icon_only')");

            table.HasCheckConstraint(
                "ck_project_widget_settings_hidden_paths",
                $"cardinality(hidden_paths) <= {ProjectWidgetSettings.MaxHiddenPaths}");
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
            .HasComment("bottom_right | bottom_left | top_right | top_left. De que canto a ferramenta sai; nos de cima, o quadro abre para baixo.");

        builder.Property(settings => settings.Theme)
            .HasColumnName("theme")
            .HasConversion(new SnakeCaseEnumConverter<WidgetThemeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("auto | light | dark. Auto segue o sistema de quem visita o site do cliente.");

        builder.Property(settings => settings.OffsetX)
            .HasColumnName("offset_x")
            .IsRequired()
            .HasComment("A distancia do canto ate o botao, na horizontal, em pixels (0 a 200). Vale tambem para o quadro aberto, ate onde a janela deixar.");

        builder.Property(settings => settings.OffsetY)
            .HasColumnName("offset_y")
            .IsRequired()
            .HasComment("A distancia do canto ate o botao, na vertical, em pixels (0 a 200).");

        builder.Property(settings => settings.LauncherIcon)
            .HasColumnName("launcher_icon")
            .HasConversion(new SnakeCaseEnumConverter<WidgetLauncherIconEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("none | chat | bug | lightbulb | question | megaphone | star. O desenho dentro do botao; none e so o texto.");

        builder.Property(settings => settings.LauncherIconOnly)
            .HasColumnName("launcher_icon_only")
            .IsRequired()
            .HasComment("O botao mostra so o icone; o texto vira a dica e o nome para o leitor de tela. Exige um icone.");

        builder.Property(settings => settings.LauncherSize)
            .HasColumnName("launcher_size")
            .HasConversion(new SnakeCaseEnumConverter<WidgetLauncherSizeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("small | medium | large. O tamanho do botao; medium e o de sempre.");

        builder.Property(settings => settings.LauncherShape)
            .HasColumnName("launcher_shape")
            .HasConversion(new SnakeCaseEnumConverter<WidgetLauncherShapeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("pill | rounded | square. O arredondamento do botao; com so o icone, a pilula vira circulo.");

        builder.Property(settings => settings.LauncherTextColor)
            .HasColumnName("launcher_text_color")
            .HasMaxLength(ProjectWidgetSettings.MaxAccentColorLength)
            .HasComment("A cor do texto e do icone sobre o botao, em #rrggbb. Nulo e automatico: a de maior contraste com a cor do botao.");

        builder.Property(settings => settings.LauncherShadow)
            .HasColumnName("launcher_shadow")
            .IsRequired()
            .HasComment("Uma sombra embaixo do botao parado na pagina.");

        builder.Property(settings => settings.MobileMode)
            .HasColumnName("mobile_mode")
            .HasConversion(new SnakeCaseEnumConverter<WidgetMobileModeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("same | icon_only | hidden. Como o botao fica numa janela estreita (celular).");

        builder.Property(settings => settings.HiddenPaths)
            .HasColumnName("hidden_paths")
            .HasColumnType("text[]")
            .IsRequired()
            .HasComment("As paginas do site onde o botao nao aparece, ate 20: caminho exato (/checkout) ou comeco terminado em * (/login/*, que vale para /login e o que vem embaixo). Sem ? nem #.");

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

        builder.Property(settings => settings.SuccessMessage)
            .HasColumnName("success_message")
            .HasMaxLength(ProjectWidgetSettings.MaxSuccessMessageLength)
            .IsRequired()
            .HasComment("A frase acima do protocolo, na confirmacao. Aceita {{primeiroNome}}, {{protocolo}}, {{tipo}} e {{projeto}}, com o padrao depois da barra ({{primeiroNome|pessoa}}); a ferramenta troca depois de enviar.");

        Text(builder, settings => settings.SubmitLabel, "submit_label", ProjectWidgetSettings.MaxSubmitLabelLength,
            "O texto do botao que envia o relato. Sem variaveis.");

        Text(builder, settings => settings.ReportTitleQuestion, "report_title_question", ProjectWidgetSettings.MaxReportTitleQuestionLength,
            "A pergunta do titulo, acima da linha curta. Sem variaveis.");

        Text(builder, settings => settings.ReportTitlePlaceholder, "report_title_placeholder", ProjectWidgetSettings.MaxReportTitlePlaceholderLength,
            "O exemplo cinza dentro da linha do titulo. Sem variaveis.");

        Text(builder, settings => settings.TypeFieldLabel, "type_field_label", ProjectWidgetSettings.MaxTypeFieldLabelLength,
            "O nome do seletor de tipo. Sem variaveis.");

        Text(builder, settings => settings.MoreDetailsLabel, "more_details_label", ProjectWidgetSettings.MaxMoreDetailsLabelLength,
            "O nome da caixa livre quando ela vem depois das perguntas do tipo. Sem variaveis.");

        Text(builder, settings => settings.NameQuestion, "name_question", ProjectWidgetSettings.MaxNameQuestionLength,
            "A pergunta do nome, quando o projeto pergunta. Sem variaveis.");

        Text(builder, settings => settings.PublicNotice, "public_notice", ProjectWidgetSettings.MaxPublicNoticeLength,
            "O aviso de que o relato pode virar publico, antes de a pessoa escrever. A frase sobre o nome vem depois e nao e configuravel: depende da visibilidade. Sem variaveis.");

        Text(builder, settings => settings.TrackingIntro, "tracking_intro", ProjectWidgetSettings.MaxTrackingIntroLength,
            "A frase do topo da pagina de acompanhamento. Aceita as variaveis da confirmacao e {{etapa}}; a pagina troca na leitura.");

        builder.Property(settings => settings.ShowsTypeField)
            .HasColumnName("shows_type_field")
            .IsRequired()
            .HasDefaultValue(true)
            .HasComment("Mostra ou esconde o seletor de tipo no formulario.");

        builder.Property(settings => settings.DefaultReportTypeId)
            .HasColumnName("default_report_type_id")
            .HasComment("O tipo de relato que vem pre-marcado, e o gravado quando o seletor esta escondido. Nulo e o padrao: o primeiro tipo ativo do projeto. O escolhido que for desativado tambem cai no primeiro ativo, na leitura.");

        // Restrict: tipo nao se apaga, se desativa — e desativado, a leitura ja cai
        // no primeiro ativo. Sem navegacao: ninguem le o tipo por aqui, so o numero.
        builder.HasOne<ProjectReportType>()
            .WithMany()
            .HasForeignKey(settings => settings.DefaultReportTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Property(settings => settings.ReportTitleMode)
            .HasColumnName("report_title_mode")
            .HasConversion(new SnakeCaseEnumConverter<ReportTitleModeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("optional | required | hidden. Como a ferramenta pergunta o titulo (\"em poucas palavras, o que aconteceu?\"). Obrigatoria, a API recusa o relato sem ele.");

        // Uma linha por projeto. O filtro deixa de fora o que foi apagado: sem ele,
        // um projeto apagado logicamente e recriado esbarraria numa linha invisivel.
        builder.HasIndex(settings => settings.ProjectId)
            .IsUnique()
            .HasFilter("deleted_at IS NULL");
    }

    /// <summary>
    /// Um texto da ferramenta: obrigatorio, com teto. Sao oito iguais, e escrever cada
    /// um por extenso esconderia o que muda entre eles — o nome, o teto e o comentario.
    /// </summary>
    private static void Text(
        EntityTypeBuilder<ProjectWidgetSettings> builder,
        System.Linq.Expressions.Expression<Func<ProjectWidgetSettings, string>> property,
        string column,
        int maxLength,
        string comment)
        => builder.Property(property)
            .HasColumnName(column)
            .HasMaxLength(maxLength)
            .IsRequired()
            .HasComment(comment);
}
