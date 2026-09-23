using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "report_attachments",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    report_id = table.Column<long>(type: "bigint", nullable: false, comment: "Relato a que o anexo pertence. Obrigatorio mesmo quando o anexo veio numa resposta, para achar o relato ser sempre um salto so — e para o isolamento por conta nao depender de uma coluna que pode ser nula."),
                    public_comment_id = table.Column<long>(type: "bigint", nullable: true, comment: "Preenchido quando o anexo veio junto de uma resposta ao pedido de informacao. Nulo quando veio na criacao do relato."),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "image ou video. A mesma lista de project_media_kinds, porque e ela que diz qual limite se aplica."),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "pending ou confirmed. Nasce pending quando a permissao e assinada, e so vira confirmed quando a nossa API confere os bytes e prende o anexo ao relato. O que fica pending e orfao — ocupa espaco e nao pertence a nada."),
                    object_key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false, comment: "O nome do arquivo no armazenamento, sorteado por nos e nunca derivado do nome que veio de fora — nome escolhido de fora permitiria escrever por cima do arquivo de outra pessoa. Nunca um endereco assinado: guardado, ele viraria link permanente com outro nome."),
                    thumbnail_object_key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true, comment: "A miniatura, gerada no proprio navegador antes do envio. No video e o quadro de capa. Vem de fora, entao ela tambem e conferida."),
                    content_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false, comment: "O tipo declarado, que entrou na assinatura do envio. Garante o rotulo, e nao o conteudo — quem confere os bytes e a confirmacao, na nossa API."),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false, comment: "Tamanho do que o armazenamento aceitou, lido dele na confirmacao e nao do que o navegador disse."),
                    duration_seconds = table.Column<int>(type: "integer", nullable: true, comment: "Duracao em segundos, so para o que tem duracao."),
                    original_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true, comment: "O nome que o arquivo tinha na maquina de quem relata. Guardado para o time, e nunca mostrado do lado de fora: nome de arquivo conta pasta, cliente e numero de contrato, que a imagem nao conta."),
                    confirmed_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando a nossa API prendeu o anexo ao relato. Nulo e orfao."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_report_attachments", x => x.id);
                    table.ForeignKey(
                        name: "fk_report_attachments_report_public_comments_public_comment_id",
                        column: x => x.public_comment_id,
                        principalTable: "report_public_comments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_report_attachments_reports_report_id",
                        column: x => x.report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "O registro de um arquivo que veio com o relato. O arquivo em si nao esta aqui e nunca estara: o que a linha guarda e o nome dele no armazenamento, o bastante para pedir uma permissao de leitura quando alguem que pode ver aparecer.");

            migrationBuilder.CreateIndex(
                name: "ix_report_attachments_deleted_at",
                table: "report_attachments",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_report_attachments_public_comment_id",
                table: "report_attachments",
                column: "public_comment_id");

            migrationBuilder.CreateIndex(
                name: "ix_report_attachments_report_id",
                table: "report_attachments",
                column: "report_id");

            migrationBuilder.CreateIndex(
                name: "ux_report_attachments_object_key",
                table: "report_attachments",
                column: "object_key",
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_report_attachments_public_id",
                table: "report_attachments",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "report_attachments");
        }
    }
}
