using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddFormBackgroundColor : Migration
    {
        // Nula em todas as linhas que ja existem, e sem DEFAULT: nulo e o fundo do tema, e
        // o formulario de quem ja tinha salvo a configuracao continua como estava.

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "form_background_color",
                table: "project_widget_settings",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true,
                comment: "O fundo do formulario aberto e da tela de abrindo, em #rrggbb. Nulo e o fundo do tema; com uma cor, o texto e as bordas saem da luminancia dela.");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "form_background_color",
                table: "project_widget_settings");
        }
    }
}
