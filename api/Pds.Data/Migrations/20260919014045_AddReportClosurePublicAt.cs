using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportClosurePublicAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // **Tres passos, e nao um.** O EF preencheria as linhas existentes com
            // `0001-01-01`, que funciona — qualquer data no passado ja vale la fora —
            // e mente: diria que aquele fechamento passou a valer no ano 1. Quem for
            // medir a janela de espera depois leria isso como dado.
            //
            // Os fechamentos que ja existem nasceram antes de a espera existir, entao
            // valeram no instante em que foram gravados: `closed_at`.
            migrationBuilder.AddColumn<DateTime>(
                name: "public_at",
                table: "report_closures",
                type: "timestamp without time zone",
                nullable: true,
                comment: "Quando este fechamento passa a valer para quem relatou. Igual a closed_at quando nao ha espera configurada; adiante dele durante a janela de desfazer. O painel nao le esta coluna: por dentro o relato esta encerrado desde closed_at.");

            migrationBuilder.Sql("UPDATE report_closures SET public_at = closed_at WHERE public_at IS NULL;");

            migrationBuilder.AlterColumn<DateTime>(
                name: "public_at",
                table: "report_closures",
                type: "timestamp without time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp without time zone",
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "public_at",
                table: "report_closures");
        }
    }
}
