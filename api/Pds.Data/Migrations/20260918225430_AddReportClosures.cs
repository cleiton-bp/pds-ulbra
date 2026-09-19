using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportClosures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "report_closures",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    report_id = table.Column<long>(type: "bigint", nullable: false, comment: "Relato encerrado."),
                    outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "done | wont_do | no_answer | duplicate. Guardado aqui e nao lido da etapa publica: a jornada e configuracao e pode ser reescrita, o desfecho deste relato nao."),
                    reason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false, comment: "Por que acabou, escrito por quem encerrou. Obrigatorio: sem ele a pessoa fica sabendo que acabou e nao o que aconteceu."),
                    closed_by_user_id = table.Column<long>(type: "bigint", nullable: true, comment: "Quem do time encerrou. Nulo quer dizer que foi o sistema, no fim do prazo do pedido de informacao."),
                    closed_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Quando encerrou, em UTC. Separado de created_at porque encerramento agendado e gravado quando a fila o consome."),
                    confirmed_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando quem relatou confirmou que resolveu. Nulo enquanto nao respondeu."),
                    satisfaction = table.Column<int>(type: "integer", nullable: true, comment: "Nota de 1 a 5 dada na confirmacao. Nula quando nao houve resposta, e nula tambem quando houve recusa — que e outra coisa, e mora na coluna ao lado."),
                    satisfaction_declined = table.Column<bool>(type: "boolean", nullable: false, comment: "A pessoa clicou em 'prefiro nao responder'. Fora da escala de proposito: dentro dela viraria a nota mais baixa e a media contaria recusa como insatisfacao."),
                    reopened_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando quem relatou reabriu. Preenchido, esta linha deixou de ser o fim do relato."),
                    reopen_comment = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true, comment: "Por que reabriu, quando o projeto pede o comentario. E para quem for pegar o trabalho de novo, e nao para justificar o pedido."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_report_closures", x => x.id);
                    table.CheckConstraint("ck_report_closures_satisfaction_range", "satisfaction IS NULL OR (satisfaction >= 1 AND satisfaction <= 5)");
                    table.CheckConstraint("ck_report_closures_satisfaction_xor_declined", "NOT (satisfaction IS NOT NULL AND satisfaction_declined)");
                    table.ForeignKey(
                        name: "fk_report_closures_reports_report_id",
                        column: x => x.report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_report_closures_users_closed_by_user_id",
                        column: x => x.closed_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                },
                comment: "O fim de um relato, com o motivo, e a resposta de quem o escreveu. Tabela propria e nao comentario: acontece uma vez por fechamento, carrega um desfecho e espera resposta. Uma linha por fechamento — relato reaberto e fechado de novo ganha linha nova, e as duas ficam.");

            migrationBuilder.CreateIndex(
                name: "ix_report_closures_closed_by_user_id",
                table: "report_closures",
                column: "closed_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_report_closures_deleted_at",
                table: "report_closures",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_report_closures_report_id_closed_at",
                table: "report_closures",
                columns: new[] { "report_id", "closed_at" });

            migrationBuilder.CreateIndex(
                name: "ux_report_closures_public_id",
                table: "report_closures",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "report_closures");
        }
    }
}
