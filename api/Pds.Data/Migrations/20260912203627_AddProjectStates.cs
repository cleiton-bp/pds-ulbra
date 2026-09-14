using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectStates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_states",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono do estado. A fila de trabalho e de cada sistema, nao da conta."),
                    name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false, comment: "Nome dado pelo time, como Analise ou Corrigindo. Renomear nao reescreve o passado: o evento guarda o nome que valia na epoca."),
                    position = table.Column<int>(type: "integer", nullable: false, comment: "Ordem na tela, escolhida pelo cliente. Fila de trabalho tem sequencia, entao nao serve a ordem alfabetica."),
                    deactivated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o estado aceita relato novo; preenchido para aposenta-lo sem apagar, porque relato antigo continua apontando para ele."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_states", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_states_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "A fila de trabalho de cada projeto, com os nomes que o proprio cliente deu. Existe porque estados fixos, definidos por nos, obrigariam todo time a descrever o processo dele com as nossas palavras.");

            migrationBuilder.CreateIndex(
                name: "ix_project_states_deleted_at",
                table: "project_states",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_states_project_id",
                table: "project_states",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_states_project_id_name",
                table: "project_states",
                columns: new[] { "project_id", "name" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_states_public_id",
                table: "project_states",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_states");
        }
    }
}
