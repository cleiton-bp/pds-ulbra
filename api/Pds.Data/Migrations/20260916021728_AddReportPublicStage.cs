using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportPublicStage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "project_public_stage_id",
                table: "reports",
                type: "bigint",
                nullable: true,
                comment: "Em que etapa da jornada publica o relato aparece. Nulo enquanto ele nao apareceu em nenhuma. E cache, como project_state_id: a verdade e a sequencia de eventos.");

            migrationBuilder.CreateIndex(
                name: "ix_reports_project_public_stage_id",
                table: "reports",
                column: "project_public_stage_id");

            migrationBuilder.AddForeignKey(
                name: "fk_reports_project_public_stages_project_public_stage_id",
                table: "reports",
                column: "project_public_stage_id",
                principalTable: "project_public_stages",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_reports_project_public_stages_project_public_stage_id",
                table: "reports");

            migrationBuilder.DropIndex(
                name: "ix_reports_project_public_stage_id",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "project_public_stage_id",
                table: "reports");
        }
    }
}
