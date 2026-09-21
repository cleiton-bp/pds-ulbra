using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectIdentitySettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_identity_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1."),
                    mode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "protocol, personal_code ou inherited_identity. Excludentes: cada um responde de um jeito diferente a pergunta 'quem e voce'. Trocar de modo nao reescreve o passado — o relato que entrou sem identidade continua abrindo pelo link."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_identity_settings", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_identity_settings_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Como quem abre um relato e reconhecido neste projeto, e o que isso permite na visibilidade. Uma linha por projeto, criada so quando alguem salva — os padroes vivem no codigo, e projeto sem linha e projeto que nunca precisou mudar nada.");

            migrationBuilder.CreateIndex(
                name: "ix_project_identity_settings_deleted_at",
                table: "project_identity_settings",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_project_identity_settings_project_id",
                table: "project_identity_settings",
                column: "project_id",
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_identity_settings_public_id",
                table: "project_identity_settings",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_identity_settings");
        }
    }
}
