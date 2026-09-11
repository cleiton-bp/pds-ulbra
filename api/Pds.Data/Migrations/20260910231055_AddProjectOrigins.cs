using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectOrigins : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_origins",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto que autoriza este dominio."),
                    domain = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false, comment: "Dominio autorizado, guardado em minusculo, sem esquema e sem barra final. A porta faz parte quando informada."),
                    allows_subdomains = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false, comment: "Quando verdadeiro vale para app.site.com e loja.site.com sem precisar de uma linha para cada."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_origins", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_origins_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "De quais enderecos um relato pode ser aberto. A chave publica viaja no site do cliente e qualquer um consegue le-la; sem esta lista, a chave copiada de um site funciona em qualquer outro.");

            migrationBuilder.CreateIndex(
                name: "ix_project_origins_deleted_at",
                table: "project_origins",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_origins_project_id",
                table: "project_origins",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_origins_project_id_domain",
                table: "project_origins",
                columns: new[] { "project_id", "domain" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_origins_public_id",
                table: "project_origins",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_origins");
        }
    }
}
