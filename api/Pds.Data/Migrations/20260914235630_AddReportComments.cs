using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportComments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "report_internal_comments",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    report_id = table.Column<long>(type: "bigint", nullable: false, comment: "Relato comentado."),
                    user_id = table.Column<long>(type: "bigint", nullable: false, comment: "Quem escreveu. Obrigatorio: comentario interno sem autor nao serve para decidir nada depois."),
                    body = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: false, comment: "O texto como o time escreveu. Nao sai desta tabela, nem para o payload do evento."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_report_internal_comments", x => x.id);
                    table.ForeignKey(
                        name: "fk_report_internal_comments_reports_report_id",
                        column: x => x.report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_report_internal_comments_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                },
                comment: "O que o time escreve entre si. E tabela separada do comentario publico, e nao um campo de visibilidade, porque com sinalizador basta esquecer um filtro para vazar e com tabelas separadas vazar exige uma consulta que nao existe.");

            migrationBuilder.CreateTable(
                name: "report_public_comments",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    report_id = table.Column<long>(type: "bigint", nullable: false, comment: "Relato comentado."),
                    user_id = table.Column<long>(type: "bigint", nullable: false, comment: "Quem escreveu, do lado de dentro. A camada publica nao mostra o nome, mas quem respondeu e pergunta interna."),
                    body = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: false, comment: "O texto que vai ser lido por quem relatou."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_report_public_comments", x => x.id);
                    table.ForeignKey(
                        name: "fk_report_public_comments_reports_report_id",
                        column: x => x.report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_report_public_comments_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                },
                comment: "O que o time escolhe dizer a quem relatou. Ainda nao tem leitor: a camada que o relator le vem depois, e ate la ele e publico no nome. Tabela separada do interno pelo mesmo motivo que a outra.");

            migrationBuilder.CreateIndex(
                name: "ix_report_internal_comments_deleted_at",
                table: "report_internal_comments",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_report_internal_comments_report_id_created_at",
                table: "report_internal_comments",
                columns: new[] { "report_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_report_internal_comments_user_id",
                table: "report_internal_comments",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ux_report_internal_comments_public_id",
                table: "report_internal_comments",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_report_public_comments_deleted_at",
                table: "report_public_comments",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_report_public_comments_report_id_created_at",
                table: "report_public_comments",
                columns: new[] { "report_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_report_public_comments_user_id",
                table: "report_public_comments",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ux_report_public_comments_public_id",
                table: "report_public_comments",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "report_internal_comments");

            migrationBuilder.DropTable(
                name: "report_public_comments");
        }
    }
}
