using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportInfoRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<long>(
                name: "user_id",
                table: "report_public_comments",
                type: "bigint",
                nullable: true,
                comment: "Quem escreveu, do lado de dentro. Nulo quer dizer que foi quem relatou: e o que faz desta tabela a conversa dos dois lados.",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldComment: "Quem escreveu, do lado de dentro. A camada publica nao mostra o nome, mas quem respondeu e pergunta interna.");

            migrationBuilder.CreateTable(
                name: "report_info_requests",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    report_id = table.Column<long>(type: "bigint", nullable: false, comment: "Relato devolvido."),
                    asked_by_user_id = table.Column<long>(type: "bigint", nullable: false, comment: "Quem do time pediu. Obrigatorio, ao contrario do encerramento: o sistema encerra sozinho no fim do prazo, mas nunca pergunta nada."),
                    asked_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Quando o pedido foi aberto, em UTC."),
                    warn_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "A partir de quando a pagina avisa que o relato vai encerrar. Gravado aqui e nao lido da configuracao: mudar o prazo do projeto nao pode mover o prazo de um pedido em curso."),
                    close_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Quando o relato encerra como sem retorno, se ninguem responder. E este o momento agendado na fila."),
                    answered_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando quem relatou respondeu. Preenchido, o prazo nao vale mais."),
                    expired_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando o prazo venceu e o relato foi encerrado sem resposta."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_report_info_requests", x => x.id);
                    table.CheckConstraint("ck_report_info_requests_answered_xor_expired", "NOT (answered_at IS NOT NULL AND expired_at IS NOT NULL)");
                    table.CheckConstraint("ck_report_info_requests_deadlines", "warn_at <= close_at AND asked_at <= warn_at");
                    table.ForeignKey(
                        name: "fk_report_info_requests_reports_report_id",
                        column: x => x.report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_report_info_requests_users_asked_by_user_id",
                        column: x => x.asked_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                },
                comment: "Quando o time devolve o relato pedindo contexto, em vez de encerrar. 'Nao reproduzi' e 'nao vamos fazer' chegando iguais ao relator fazem ele entender que acabou e parar de responder. A pergunta em si mora num comentario publico; esta linha guarda o relogio.");

            migrationBuilder.CreateIndex(
                name: "ix_report_info_requests_asked_by_user_id",
                table: "report_info_requests",
                column: "asked_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_report_info_requests_close_at",
                table: "report_info_requests",
                column: "close_at",
                filter: "answered_at IS NULL AND expired_at IS NULL AND deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_report_info_requests_deleted_at",
                table: "report_info_requests",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_report_info_requests_report_id_asked_at",
                table: "report_info_requests",
                columns: new[] { "report_id", "asked_at" });

            migrationBuilder.CreateIndex(
                name: "ux_report_info_requests_public_id",
                table: "report_info_requests",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "report_info_requests");

            migrationBuilder.AlterColumn<long>(
                name: "user_id",
                table: "report_public_comments",
                type: "bigint",
                nullable: false,
                defaultValue: 0L,
                comment: "Quem escreveu, do lado de dentro. A camada publica nao mostra o nome, mas quem respondeu e pergunta interna.",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true,
                oldComment: "Quem escreveu, do lado de dentro. Nulo quer dizer que foi quem relatou: e o que faz desta tabela a conversa dos dois lados.");
        }
    }
}
