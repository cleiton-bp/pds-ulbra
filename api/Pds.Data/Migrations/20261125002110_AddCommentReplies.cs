using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCommentReplies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "reply_to_id",
                table: "report_public_comments",
                type: "bigint",
                nullable: true,
                comment: "A mensagem da conversa com quem relatou que este comentario responde, citada no painel. Nula quando nao responde nenhuma. Quem relatou le so o texto.");

            migrationBuilder.AddColumn<long>(
                name: "reply_to_id",
                table: "report_internal_comments",
                type: "bigint",
                nullable: true,
                comment: "A mensagem entre o time que este comentario responde, como a citacao de um chat. Nula quando nao responde nenhuma.");

            migrationBuilder.CreateIndex(
                name: "ix_report_public_comments_reply_to_id",
                table: "report_public_comments",
                column: "reply_to_id");

            migrationBuilder.CreateIndex(
                name: "ix_report_internal_comments_reply_to_id",
                table: "report_internal_comments",
                column: "reply_to_id");

            migrationBuilder.AddForeignKey(
                name: "fk_report_internal_comments_reply_to_id",
                table: "report_internal_comments",
                column: "reply_to_id",
                principalTable: "report_internal_comments",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_report_public_comments_report_public_comments_reply_to_id",
                table: "report_public_comments",
                column: "reply_to_id",
                principalTable: "report_public_comments",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_report_internal_comments_reply_to_id",
                table: "report_internal_comments");

            migrationBuilder.DropForeignKey(
                name: "fk_report_public_comments_report_public_comments_reply_to_id",
                table: "report_public_comments");

            migrationBuilder.DropIndex(
                name: "ix_report_public_comments_reply_to_id",
                table: "report_public_comments");

            migrationBuilder.DropIndex(
                name: "ix_report_internal_comments_reply_to_id",
                table: "report_internal_comments");

            migrationBuilder.DropColumn(
                name: "reply_to_id",
                table: "report_public_comments");

            migrationBuilder.DropColumn(
                name: "reply_to_id",
                table: "report_internal_comments");
        }
    }
}
