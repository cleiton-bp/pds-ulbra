using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <summary>
    /// A fila de moderacao, e o nome opcional de quem relatou.
    /// </summary>
    /// <remarks>
    /// <para><b>Todo relato que ja existia vira <c>pending</c>.</b> Nao e escolha
    /// conservadora por precaucao: nenhum deles foi escrito sabendo que seria
    /// publico, e o aviso que passa a existir no formulario nunca apareceu para
    /// quem os escreveu. Liberar qualquer um sem alguem ler seria publicar texto
    /// que ninguem ofereceu.</para>
    ///
    /// <para><b>As duas colunas obrigatorias entram em tres passos, sem valor
    /// padrao de coluna.</b> Anulaveis, preenchidas, e so entao obrigatorias — e o
    /// padrao do banco e retirado no fim, como nas outras: os padroes vivem no
    /// codigo, e deixa-los tambem aqui criaria um segundo lugar que ninguem
    /// lembraria de mudar junto.</para>
    /// </remarks>
    public partial class AddReportModeration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "moderated_at",
                table: "reports",
                type: "timestamp without time zone",
                nullable: true,
                comment: "Quando alguem do time decidiu. Nulo enquanto ninguem decidiu.");

            migrationBuilder.AddColumn<long>(
                name: "moderated_by_user_id",
                table: "reports",
                type: "bigint",
                nullable: true,
                comment: "Quem do time decidiu. Nulo enquanto ninguem decidiu, e tambem quando a conta de quem decidiu foi esvaziada. Nunca sai em rota publica.");

            migrationBuilder.AddColumn<string>(
                name: "moderation_state",
                table: "reports",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true,
                comment: "pending, approved ou rejected. Todo relato nasce pending, inclusive em projeto privado: e o que faz marcar o projeto como publico depois nao publicar o historico inteiro de uma vez.");

            migrationBuilder.Sql("UPDATE reports SET moderation_state = 'pending' WHERE moderation_state IS NULL;");

            migrationBuilder.Sql("ALTER TABLE reports ALTER COLUMN moderation_state SET NOT NULL;");

            migrationBuilder.AddColumn<string>(
                name: "reporter_name",
                table: "reports",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true,
                comment: "Nome de quem relatou, quando o projeto pede e a pessoa quis dar. Nulo e o normal. Interno por padrao: so aparece la fora com o projeto em publico identificado E reporter_name_is_public verdadeiro.");

            migrationBuilder.AddColumn<bool>(
                name: "reporter_name_is_public",
                table: "reports",
                type: "boolean",
                nullable: true,
                comment: "Quem relatou escolheu assinar o relato. Falso por padrao — a caixa nasce desmarcada, porque o que esta em jogo e o nome dela ao lado de um texto que qualquer um le.");

            migrationBuilder.Sql("UPDATE reports SET reporter_name_is_public = false WHERE reporter_name_is_public IS NULL;");

            migrationBuilder.Sql("ALTER TABLE reports ALTER COLUMN reporter_name_is_public SET NOT NULL;");

            migrationBuilder.CreateIndex(
                name: "ix_reports_moderated_by_user_id",
                table: "reports",
                column: "moderated_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_reports_project_id_moderation_state",
                table: "reports",
                columns: new[] { "project_id", "moderation_state" });

            migrationBuilder.AddForeignKey(
                name: "fk_reports_users_moderated_by_user_id",
                table: "reports",
                column: "moderated_by_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_reports_users_moderated_by_user_id",
                table: "reports");

            migrationBuilder.DropIndex(
                name: "ix_reports_moderated_by_user_id",
                table: "reports");

            migrationBuilder.DropIndex(
                name: "ix_reports_project_id_moderation_state",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "moderated_at",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "moderated_by_user_id",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "moderation_state",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "reporter_name",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "reporter_name_is_public",
                table: "reports");
        }
    }
}
