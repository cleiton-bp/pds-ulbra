using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSubtasks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "parent_report_id",
                table: "reports",
                type: "bigint",
                nullable: true,
                comment: "O card de que este e subtarefa; nulo no card que nao e subtarefa. So o card do time e subtarefa, e um nivel so (o servico confere). Interno.");

            migrationBuilder.CreateIndex(
                name: "ix_reports_parent_report_id",
                table: "reports",
                column: "parent_report_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_parent_not_self",
                table: "reports",
                sql: "parent_report_id IS NULL OR parent_report_id <> id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_parent_team",
                table: "reports",
                sql: "parent_report_id IS NULL OR kind = 'team'");

            migrationBuilder.AddForeignKey(
                name: "fk_reports_reports_parent_report_id",
                table: "reports",
                column: "parent_report_id",
                principalTable: "reports",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_reports_reports_parent_report_id",
                table: "reports");

            migrationBuilder.DropIndex(
                name: "ix_reports_parent_report_id",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_parent_not_self",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_parent_team",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "parent_report_id",
                table: "reports");
        }
    }
}
