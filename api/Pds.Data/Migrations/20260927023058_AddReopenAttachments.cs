using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <summary>
    /// A reabertura vira um envio proprio de anexo: a coluna que prende o arquivo ao
    /// fechamento reaberto, a trava de um envio por arquivo, e a chave do projeto —
    /// ligada para todo mundo, inclusive para quem ja existia, que e o padrao de
    /// fabrica.
    /// </summary>
    public partial class AddReopenAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<long>(
                name: "public_comment_id",
                table: "report_attachments",
                type: "bigint",
                nullable: true,
                comment: "Preenchido quando o anexo veio junto de uma resposta ao pedido de informacao. Nulo na criacao e na reabertura.",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true,
                oldComment: "Preenchido quando o anexo veio junto de uma resposta ao pedido de informacao. Nulo quando veio na criacao do relato.");

            migrationBuilder.AddColumn<long>(
                name: "reopened_closure_id",
                table: "report_attachments",
                type: "bigint",
                nullable: true,
                comment: "Preenchido quando o anexo veio junto de uma reabertura: o fechamento que quem relatou reabriu. Nulo na criacao e na resposta. Coluna propria, e nao deduzida pela data: e ela que faz a cota da reabertura ser um filtro, e a tela saber onde mostrar o arquivo.");

            // Anulavel, preenchida, e so entao obrigatoria: o padrao mora no codigo, e
            // nao na coluna. Um valor padrao aqui continuaria valendo para as linhas
            // novas depois de alguem mudar de ideia no codigo.
            migrationBuilder.AddColumn<bool>(
                name: "allows_on_reopen",
                table: "project_media_settings",
                type: "boolean",
                nullable: true,
                comment: "Da para anexar ao reabrir um relato encerrado — o print do que ainda esta acontecendo. Chave propria, e nao a da resposta: atender ao pedido do time e dizer que o problema voltou sao perguntas diferentes.");

            migrationBuilder.Sql("UPDATE project_media_settings SET allows_on_reopen = true WHERE allows_on_reopen IS NULL;");

            migrationBuilder.Sql("ALTER TABLE project_media_settings ALTER COLUMN allows_on_reopen SET NOT NULL;");

            migrationBuilder.CreateIndex(
                name: "ix_report_attachments_reopened_closure_id",
                table: "report_attachments",
                column: "reopened_closure_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_report_attachments_one_submission",
                table: "report_attachments",
                sql: "public_comment_id IS NULL OR reopened_closure_id IS NULL");

            migrationBuilder.AddForeignKey(
                name: "fk_report_attachments_report_closures_reopened_closure_id",
                table: "report_attachments",
                column: "reopened_closure_id",
                principalTable: "report_closures",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_report_attachments_report_closures_reopened_closure_id",
                table: "report_attachments");

            migrationBuilder.DropIndex(
                name: "ix_report_attachments_reopened_closure_id",
                table: "report_attachments");

            migrationBuilder.DropCheckConstraint(
                name: "ck_report_attachments_one_submission",
                table: "report_attachments");

            migrationBuilder.DropColumn(
                name: "reopened_closure_id",
                table: "report_attachments");

            migrationBuilder.DropColumn(
                name: "allows_on_reopen",
                table: "project_media_settings");

            migrationBuilder.AlterColumn<long>(
                name: "public_comment_id",
                table: "report_attachments",
                type: "bigint",
                nullable: true,
                comment: "Preenchido quando o anexo veio junto de uma resposta ao pedido de informacao. Nulo quando veio na criacao do relato.",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true,
                oldComment: "Preenchido quando o anexo veio junto de uma resposta ao pedido de informacao. Nulo na criacao e na reabertura.");
        }
    }
}
