using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCardLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "card_links",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "O projeto dos dois cards, repetido para o filtro de acesso nao precisar de juncao."),
                    from_report_id = table.Column<long>(type: "bigint", nullable: false, comment: "O card de origem: o duplicado, o que bloqueia, ou quem vinculou o relacionado."),
                    to_report_id = table.Column<long>(type: "bigint", nullable: false, comment: "O card de destino: o original, o bloqueado, ou o relacionado."),
                    type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "duplicate_of | blocks | relates_to, na direcao de from_report_id para to_report_id."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_card_links", x => x.id);
                    table.CheckConstraint("ck_card_links_not_self", "from_report_id <> to_report_id");
                    table.CheckConstraint("ck_card_links_type", "type IN ('duplicate_of', 'blocks', 'relates_to')");
                    table.ForeignKey(
                        name: "fk_card_links_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_card_links_reports_from_report_id",
                        column: x => x.from_report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_card_links_reports_to_report_id",
                        column: x => x.to_report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                },
                comment: "Os vinculos entre cards do mesmo projeto: duplicado de, bloqueia, relacionado a. Um por par de cards. Interno: nenhuma rota publica le esta tabela.");

            migrationBuilder.CreateIndex(
                name: "ix_card_links_deleted_at",
                table: "card_links",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_card_links_project_id",
                table: "card_links",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ix_card_links_to_report_id",
                table: "card_links",
                column: "to_report_id");

            migrationBuilder.CreateIndex(
                name: "ux_card_links_from_report_id",
                table: "card_links",
                column: "from_report_id",
                unique: true,
                filter: "deleted_at IS NULL AND type = 'duplicate_of'");

            migrationBuilder.CreateIndex(
                name: "ux_card_links_from_report_id_to_report_id",
                table: "card_links",
                columns: new[] { "from_report_id", "to_report_id" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_card_links_public_id",
                table: "card_links",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "card_links");
        }
    }
}
