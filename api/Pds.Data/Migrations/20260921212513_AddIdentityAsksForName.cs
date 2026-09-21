using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <summary>
    /// A pergunta do nome, desligada para todo mundo — inclusive para quem ja
    /// existia. Coletar dado pessoal nao comeca por migracao.
    /// </summary>
    public partial class AddIdentityAsksForName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "asks_for_name",
                table: "project_identity_settings",
                type: "boolean",
                nullable: true,
                comment: "A ferramenta pergunta o nome de quem relata. Desligado de fabrica: coletar dado pessoal precisa ser um ato de quem configura. Perguntar nao e publicar — o nome so sai la fora com visibility = public_identified E o relato assinado pela propria pessoa.");

            migrationBuilder.Sql("UPDATE project_identity_settings SET asks_for_name = false WHERE asks_for_name IS NULL;");

            migrationBuilder.Sql("ALTER TABLE project_identity_settings ALTER COLUMN asks_for_name SET NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "asks_for_name",
                table: "project_identity_settings");
        }
    }
}
