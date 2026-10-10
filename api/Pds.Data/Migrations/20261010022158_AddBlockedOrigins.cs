using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBlockedOrigins : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "blocked_origin_kept_at",
                table: "reports",
                type: "timestamp without time zone",
                nullable: true,
                comment: "Quando o time decidiu manter o relato vindo de um endereco bloqueado. Nulo e ninguem decidiu: a marca de origem bloqueada sai da lista de bloqueados de agora, e nao desta coluna.");

            migrationBuilder.CreateTable(
                name: "project_blocked_origins",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto que bloqueia este dominio."),
                    domain = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false, comment: "Dominio bloqueado, normalizado como na lista de autorizados: minusculo, sem esquema e sem barra final. A porta faz parte quando informada."),
                    includes_subdomains = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false, comment: "Quando verdadeiro barra tambem app.site.com e loja.site.com. Desligado por padrao: barrar os vizinhos sem pedir pode tirar do ar um site do proprio cliente."),
                    blocked_by_user_id = table.Column<long>(type: "bigint", nullable: true, comment: "Quem bloqueou. Nulo quando a conta da pessoa foi esvaziada: o bloqueio continua valendo sem ela."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_blocked_origins", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_blocked_origins_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_project_blocked_origins_users_blocked_by_user_id",
                        column: x => x.blocked_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                },
                comment: "Enderecos que o projeto bloqueou: a ferramenta nao abre la e o relato de la e recusado, mesmo com a lista de autorizados vazia. E a reacao a quem copiou a chave publica para outro site.");

            migrationBuilder.CreateIndex(
                name: "ix_project_blocked_origins_blocked_by_user_id",
                table: "project_blocked_origins",
                column: "blocked_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_project_blocked_origins_deleted_at",
                table: "project_blocked_origins",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_project_blocked_origins_project_id_domain",
                table: "project_blocked_origins",
                columns: new[] { "project_id", "domain" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_blocked_origins_public_id",
                table: "project_blocked_origins",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_blocked_origins");

            migrationBuilder.DropColumn(
                name: "blocked_origin_kept_at",
                table: "reports");
        }
    }
}
