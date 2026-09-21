using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReporterCodes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "reporter_code_id",
                table: "reports",
                type: "bigint",
                nullable: true,
                comment: "Codigo pessoal de quem escreveu, quando o projeto usa esse modo. Nulo no modo protocolo e nos relatos anteriores ao modo existir — e esses continuam valendo pelo link.");

            migrationBuilder.CreateTable(
                name: "reporter_codes",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto onde este codigo vale. Ele nao atravessa projetos."),
                    code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false, comment: "O codigo no formato do protocolo, sorteado inteiro pelo sistema. Nunca se consulta se ele existe: qualquer diferenca entre livre e ocupado vira enumeracao."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reporter_codes", x => x.id);
                    table.ForeignKey(
                        name: "fk_reporter_codes_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "O codigo que quem relata guarda para reencontrar os proprios relatos, no modo sem login. Tabela e nao coluna: o codigo vale para varios relatos, entao a unicidade precisa de uma linha propria. Nao guarda nada de pessoa — e um identificador sorteado e nada mais.");

            migrationBuilder.CreateIndex(
                name: "ix_reports_reporter_code_id",
                table: "reports",
                column: "reporter_code_id");

            migrationBuilder.CreateIndex(
                name: "ix_reporter_codes_deleted_at",
                table: "reporter_codes",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_reporter_codes_project_id_code",
                table: "reporter_codes",
                columns: new[] { "project_id", "code" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_reporter_codes_public_id",
                table: "reporter_codes",
                column: "public_id",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_reports_reporter_codes_reporter_code_id",
                table: "reports",
                column: "reporter_code_id",
                principalTable: "reporter_codes",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_reports_reporter_codes_reporter_code_id",
                table: "reports");

            migrationBuilder.DropTable(
                name: "reporter_codes");

            migrationBuilder.DropIndex(
                name: "ix_reports_reporter_code_id",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "reporter_code_id",
                table: "reports");
        }
    }
}
