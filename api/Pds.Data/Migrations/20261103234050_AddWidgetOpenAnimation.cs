using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWidgetOpenAnimation : Migration
    {
        // A abertura do formulario passa a ser do projeto. As linhas que ja existem nascem
        // com o padrao de WidgetSettingsDefaults (suave, normal): o formulario que surgia de
        // uma vez passa a abrir com movimento em todo projeto, sem ninguem configurar.
        //
        // O DEFAULT so serve para preencher essas linhas, e sai logo depois, como em
        // AddWidgetAppearance: os padroes moram uma vez, no codigo.

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "open_animation",
                table: "project_widget_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "smooth",
                comment: "smooth | slide | grow | none. Como o formulario aparece ao clicar no botao, e sai ao fechar.");

            migrationBuilder.AddColumn<string>(
                name: "open_animation_speed",
                table: "project_widget_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "normal",
                comment: "fast | normal | slow. A duracao do movimento do formulario ao abrir e fechar.");

            migrationBuilder.Sql(
                "ALTER TABLE project_widget_settings "
                + "ALTER COLUMN open_animation DROP DEFAULT, "
                + "ALTER COLUMN open_animation_speed DROP DEFAULT;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "open_animation",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "open_animation_speed",
                table: "project_widget_settings");
        }
    }
}
