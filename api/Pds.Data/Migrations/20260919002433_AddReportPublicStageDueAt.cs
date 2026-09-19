using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportPublicStageDueAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "public_stage_due_at",
                table: "reports",
                type: "timestamp without time zone",
                nullable: true,
                comment: "Quando a ultima mudanca de etapa publica passa a valer para quem relatou. Preenchida e a janela para desfazer; nula e o estado normal. E ela que sobrevive, e nao a mensagem na fila.");

            migrationBuilder.CreateIndex(
                name: "ix_reports_public_stage_due_at",
                table: "reports",
                column: "public_stage_due_at",
                filter: "public_stage_due_at IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_reports_public_stage_due_at",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "public_stage_due_at",
                table: "reports");
        }
    }
}
