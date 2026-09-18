using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectStatusMappings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "mapping_version",
                table: "projects",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                comment: "Versao do mapeamento que vale agora. Zero enquanto nada foi ligado. Nao e o maior valor de project_status_mappings: desfazer tudo grava uma versao sem linha nenhuma.");

            migrationBuilder.CreateTable(
                name: "project_status_mappings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono. Repetido aqui porque toda consulta comeca por projeto e versao."),
                    project_state_id = table.Column<long>(type: "bigint", nullable: false, comment: "O estado de dentro, de onde o relato sai."),
                    project_public_stage_id = table.Column<long>(type: "bigint", nullable: false, comment: "A etapa de fora, onde quem relatou passa a ver o relato."),
                    version = table.Column<int>(type: "integer", nullable: false, comment: "A versao a que esta linha pertence. A que vale agora e projects.mapping_version."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_status_mappings", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_status_mappings_project_public_stage_id",
                        column: x => x.project_public_stage_id,
                        principalTable: "project_public_stages",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_project_status_mappings_project_states_project_state_id",
                        column: x => x.project_state_id,
                        principalTable: "project_states",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_project_status_mappings_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Liga N estados de dentro a 1 etapa de fora. Versionada: alterar grava o conjunto inteiro de novo, um numero acima, porque reescrever o mapa apagaria o sentido de tudo que ja aconteceu.");

            migrationBuilder.CreateIndex(
                name: "ix_project_status_mappings_deleted_at",
                table: "project_status_mappings",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_status_mappings_project_id_version",
                table: "project_status_mappings",
                columns: new[] { "project_id", "version" });

            migrationBuilder.CreateIndex(
                name: "ix_project_status_mappings_project_public_stage_id",
                table: "project_status_mappings",
                column: "project_public_stage_id");

            migrationBuilder.CreateIndex(
                name: "ix_project_status_mappings_project_state_id",
                table: "project_status_mappings",
                column: "project_state_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_status_mappings_project_id_version_project_state_id",
                table: "project_status_mappings",
                columns: new[] { "project_id", "version", "project_state_id" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_status_mappings_public_id",
                table: "project_status_mappings",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_status_mappings");

            migrationBuilder.DropColumn(
                name: "mapping_version",
                table: "projects");
        }
    }
}
