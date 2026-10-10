using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWidgetAppearance : Migration
    {
        // A aparencia do botao passa a ser do projeto. Cada coluna nasce com o valor que
        // o botao tinha antes — o mesmo de WidgetSettingsDefaults: 20 pixels do canto, so
        // o texto, medio, pilula, sem sombra, igual no celular, nenhuma pagina escondida.
        // O projeto que ja tinha salvo a configuracao continua vendo o botao de sempre.
        //
        // O DEFAULT so serve para preencher as linhas que ja existem, e sai logo depois,
        // como em AddWidgetTexts: os padroes moram uma vez, no codigo.
        private static readonly string[] ComPadraoProvisorio =
        [
            "offset_x", "offset_y", "launcher_icon", "launcher_icon_only", "launcher_size",
            "launcher_shape", "launcher_shadow", "mobile_mode", "hidden_paths",
        ];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "position",
                table: "project_widget_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "bottom_right | bottom_left | top_right | top_left. De que canto a ferramenta sai; nos de cima, o quadro abre para baixo.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "bottom_right | bottom_left. De que canto inferior a ferramenta sai.");

            migrationBuilder.AddColumn<List<string>>(
                name: "hidden_paths",
                table: "project_widget_settings",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]",
                comment: "As paginas do site onde o botao nao aparece, ate 20: caminho exato (/checkout) ou comeco terminado em * (/login/*, que vale para /login e o que vem embaixo). Sem ? nem #.");

            migrationBuilder.AddColumn<string>(
                name: "launcher_icon",
                table: "project_widget_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "none",
                comment: "none | chat | bug | lightbulb | question | megaphone | star. O desenho dentro do botao; none e so o texto.");

            migrationBuilder.AddColumn<bool>(
                name: "launcher_icon_only",
                table: "project_widget_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                comment: "O botao mostra so o icone; o texto vira a dica e o nome para o leitor de tela. Exige um icone.");

            migrationBuilder.AddColumn<bool>(
                name: "launcher_shadow",
                table: "project_widget_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                comment: "Uma sombra embaixo do botao parado na pagina.");

            migrationBuilder.AddColumn<string>(
                name: "launcher_shape",
                table: "project_widget_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "pill",
                comment: "pill | rounded | square. O arredondamento do botao; com so o icone, a pilula vira circulo.");

            migrationBuilder.AddColumn<string>(
                name: "launcher_size",
                table: "project_widget_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "medium",
                comment: "small | medium | large. O tamanho do botao; medium e o de sempre.");

            migrationBuilder.AddColumn<string>(
                name: "launcher_text_color",
                table: "project_widget_settings",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true,
                comment: "A cor do texto e do icone sobre o botao, em #rrggbb. Nulo e automatico: a de maior contraste com a cor do botao.");

            migrationBuilder.AddColumn<string>(
                name: "mobile_mode",
                table: "project_widget_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "same",
                comment: "same | icon_only | hidden. Como o botao fica numa janela estreita (celular).");

            migrationBuilder.AddColumn<int>(
                name: "offset_x",
                table: "project_widget_settings",
                type: "integer",
                nullable: false,
                defaultValue: 20,
                comment: "A distancia do canto ate o botao, na horizontal, em pixels (0 a 200). Vale tambem para o quadro aberto, ate onde a janela deixar.");

            migrationBuilder.AddColumn<int>(
                name: "offset_y",
                table: "project_widget_settings",
                type: "integer",
                nullable: false,
                defaultValue: 20,
                comment: "A distancia do canto ate o botao, na vertical, em pixels (0 a 200).");

            migrationBuilder.AddCheckConstraint(
                name: "ck_project_widget_settings_hidden_paths",
                table: "project_widget_settings",
                sql: "cardinality(hidden_paths) <= 20");

            migrationBuilder.AddCheckConstraint(
                name: "ck_project_widget_settings_icon_only",
                table: "project_widget_settings",
                sql: "launcher_icon <> 'none' OR (NOT launcher_icon_only AND mobile_mode <> 'icon_only')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_project_widget_settings_offsets",
                table: "project_widget_settings",
                sql: "offset_x BETWEEN 0 AND 200 AND offset_y BETWEEN 0 AND 200");

            migrationBuilder.Sql(
                "ALTER TABLE project_widget_settings "
                + string.Join(", ", ComPadraoProvisorio.Select(coluna => $"ALTER COLUMN {coluna} DROP DEFAULT"))
                + ";");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Os cantos de cima nao existem antes desta migracao: descem para o de baixo
            // do mesmo lado, em vez de deixar no banco um valor que o codigo antigo nao le.
            migrationBuilder.Sql(
                "UPDATE project_widget_settings SET position = CASE position WHEN 'top_right' THEN 'bottom_right' ELSE 'bottom_left' END "
                + "WHERE position IN ('top_right', 'top_left');");

            migrationBuilder.DropCheckConstraint(
                name: "ck_project_widget_settings_hidden_paths",
                table: "project_widget_settings");

            migrationBuilder.DropCheckConstraint(
                name: "ck_project_widget_settings_icon_only",
                table: "project_widget_settings");

            migrationBuilder.DropCheckConstraint(
                name: "ck_project_widget_settings_offsets",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "hidden_paths",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "launcher_icon",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "launcher_icon_only",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "launcher_shadow",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "launcher_shape",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "launcher_size",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "launcher_text_color",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "mobile_mode",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "offset_x",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "offset_y",
                table: "project_widget_settings");

            migrationBuilder.AlterColumn<string>(
                name: "position",
                table: "project_widget_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "bottom_right | bottom_left. De que canto inferior a ferramenta sai.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "bottom_right | bottom_left | top_right | top_left. De que canto a ferramenta sai; nos de cima, o quadro abre para baixo.");
        }
    }
}
