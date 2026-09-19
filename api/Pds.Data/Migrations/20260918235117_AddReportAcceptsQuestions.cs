using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportAcceptsQuestions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "accepts_questions",
                table: "reports",
                type: "boolean",
                nullable: true,
                comment: "Quem relatou aceita responder duvidas da equipe. Escolha dela, nao do projeto. Nulo e o relato que entrou antes de a pergunta existir: ninguem perguntou, e ninguem respondeu.");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "accepts_questions",
                table: "reports");
        }
    }
}
