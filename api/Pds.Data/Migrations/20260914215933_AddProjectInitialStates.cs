using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectInitialStates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "project_state_id",
                table: "reports",
                type: "bigint",
                nullable: true,
                comment: "Onde o relato esta na fila do projeto. Nulo quando o projeto ainda nao tem estado nenhum. E cache: a verdade e a sequencia de eventos.");

            migrationBuilder.CreateTable(
                name: "project_initial_states",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto a que esta escolha pertence."),
                    report_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "bug, improvement ou question. Unico por projeto entre os nao apagados."),
                    project_state_id = table.Column<long>(type: "bigint", nullable: false, comment: "Estado onde o relato deste tipo cai. Do mesmo projeto, e ativo."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_initial_states", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_initial_states_project_states_project_state_id",
                        column: x => x.project_state_id,
                        principalTable: "project_states",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_project_initial_states_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Onde um relato cai ao entrar, por tipo. E tabela em vez de colunas em projects para tipo novo nao pedir migracao, e a linha so nasce quando o cliente escolhe: sem linha, vale o primeiro estado ativo da fila.");

            migrationBuilder.CreateIndex(
                name: "ix_reports_project_state_id",
                table: "reports",
                column: "project_state_id");

            migrationBuilder.CreateIndex(
                name: "ix_project_initial_states_deleted_at",
                table: "project_initial_states",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_initial_states_project_state_id",
                table: "project_initial_states",
                column: "project_state_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_initial_states_project_id_report_type",
                table: "project_initial_states",
                columns: new[] { "project_id", "report_type" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_initial_states_public_id",
                table: "project_initial_states",
                column: "public_id",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_reports_project_states_project_state_id",
                table: "reports",
                column: "project_state_id",
                principalTable: "project_states",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_reports_project_states_project_state_id",
                table: "reports");

            migrationBuilder.DropTable(
                name: "project_initial_states");

            migrationBuilder.DropIndex(
                name: "ix_reports_project_state_id",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "project_state_id",
                table: "reports");
        }
    }
}
