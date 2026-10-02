using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <summary>
    /// O arquivo vira categoria ao lado da imagem: a lista dos formatos que o dono marca,
    /// e o total por envio sem uso — cada categoria passa a ter o seu limite. O arquivo
    /// nasce desligado pelo padrao do codigo, sem linha gravada.
    /// </summary>
    public partial class AddFileAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "kind",
                table: "report_attachments",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "image, file ou video (este, so dos anexos antigos). A mesma lista de project_media_kinds, porque e ela que diz qual limite se aplica.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "image ou video. A mesma lista de project_media_kinds, porque e ela que diz qual limite se aplica.");

            migrationBuilder.AlterColumn<int>(
                name: "display_order",
                table: "report_attachments",
                type: "integer",
                nullable: false,
                comment: "A posicao no envio, a partir de zero, dentro da categoria: a ordem em que a pessoa montou as imagens, e a dos arquivos. Guardada, e nao deduzida da hora de chegada — o arquivo tentado de novo chega depois dos outros. Vale dentro de um envio; a hora de chegada desempata.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldComment: "A posicao da imagem no envio, a partir de zero: a ordem em que a pessoa as montou. Guardada, e nao deduzida da hora de chegada — o arquivo tentado de novo chega depois dos outros. Vale dentro de um envio; a hora de chegada desempata.");

            migrationBuilder.AlterColumn<int>(
                name: "max_files_per_report",
                table: "project_media_settings",
                type: "integer",
                nullable: true,
                comment: "Sem uso: era o total de arquivos por envio, somando todos os tipos. Saiu quando o arquivo virou categoria ao lado da imagem — cada categoria tem a sua quantidade e o seu tamanho. Fica com o que cada projeto tinha escolhido; configuracao salva depois disso grava nulo.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldComment: "Quantos arquivos cabem num relato, somando todos os tipos. Existe alem do limite por tipo, e nao no lugar dele: so com o limite por tipo, tres imagens mais um video passariam num projeto que so queria dois no total.");

            migrationBuilder.AlterColumn<int>(
                name: "max_count",
                table: "project_media_kinds",
                type: "integer",
                nullable: false,
                comment: "Quantos arquivos deste tipo cabem em cada envio: a criacao do relato, cada resposta, cada reabertura.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldComment: "Quantos arquivos deste tipo cabem num relato.");

            migrationBuilder.AlterColumn<string>(
                name: "kind",
                table: "project_media_kinds",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "image, file ou video (este, das linhas antigas). Unico por configuracao entre os nao apagados. A lista cresce com o produto, e acrescentar um valor nao mexe em coluna nenhuma.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "image ou video. Unico por configuracao entre os nao apagados. A lista cresce com o produto, e acrescentar um valor nao mexe em coluna nenhuma.");

            migrationBuilder.AddColumn<List<string>>(
                name: "formats",
                table: "project_media_kinds",
                type: "text[]",
                nullable: true,
                comment: "Os formatos aceitos, pelo nome no catalogo do sistema (pdf, text, spreadsheet, document, json, zip). So do arquivo; nulo nas outras categorias, que tem os tipos fixos. Uma lista, e nao uma linha por formato: poucos nomes de um catalogo fechado, lidos sempre com o resto da linha.");

            // **O total saiu, e a escolha de quem o usava continua valendo.** Um projeto com
            // total 2 e imagem 3 recebia no maximo duas imagens por envio; sem o total,
            // passaria a receber tres. O limite da imagem desce ate o total — o que o
            // projeto tinha, de fato, escolhido.
            migrationBuilder.Sql("UPDATE project_media_kinds k SET max_count = s.max_files_per_report FROM project_media_settings s WHERE k.project_media_settings_id = s.id AND k.kind = 'image' AND k.deleted_at IS NULL AND s.deleted_at IS NULL AND s.max_files_per_report IS NOT NULL AND s.max_files_per_report < k.max_count;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // **O codigo de antes nao conhece "file"**, e ler uma linha com ele quebraria a
            // lista inteira do relato. As linhas saem pelo apagado logico, e nao de vez: o
            // arquivo continua no armazenamento e a linha no banco, e quem subir de novo
            // pode devolve-las. As duas marcas tem a mesma hora — a da transacao da
            // descida —, e e ela que separa estas das que ja estavam apagadas antes.
            // Em UTC, como a aplicacao grava.
            migrationBuilder.Sql("UPDATE report_attachments SET deleted_at = (now() at time zone 'utc') WHERE kind = 'file' AND deleted_at IS NULL;");
            migrationBuilder.Sql("UPDATE project_media_kinds SET deleted_at = (now() at time zone 'utc') WHERE kind = 'file' AND deleted_at IS NULL;");

            migrationBuilder.DropColumn(
                name: "formats",
                table: "project_media_kinds");

            migrationBuilder.AlterColumn<string>(
                name: "kind",
                table: "report_attachments",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "image ou video. A mesma lista de project_media_kinds, porque e ela que diz qual limite se aplica.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "image, file ou video (este, so dos anexos antigos). A mesma lista de project_media_kinds, porque e ela que diz qual limite se aplica.");

            migrationBuilder.AlterColumn<int>(
                name: "display_order",
                table: "report_attachments",
                type: "integer",
                nullable: false,
                comment: "A posicao da imagem no envio, a partir de zero: a ordem em que a pessoa as montou. Guardada, e nao deduzida da hora de chegada — o arquivo tentado de novo chega depois dos outros. Vale dentro de um envio; a hora de chegada desempata.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldComment: "A posicao no envio, a partir de zero, dentro da categoria: a ordem em que a pessoa montou as imagens, e a dos arquivos. Guardada, e nao deduzida da hora de chegada — o arquivo tentado de novo chega depois dos outros. Vale dentro de um envio; a hora de chegada desempata.");

            // Quem salvou depois da subida gravou nulo. Zero, para o codigo de antes, seria
            // "nenhum arquivo por envio"; volta o padrao de fabrica de entao, quatro. Sem
            // valor padrao na coluna: o padrao mora no codigo.
            migrationBuilder.Sql("UPDATE project_media_settings SET max_files_per_report = 4 WHERE max_files_per_report IS NULL;");

            migrationBuilder.AlterColumn<int>(
                name: "max_files_per_report",
                table: "project_media_settings",
                type: "integer",
                nullable: false,
                comment: "Quantos arquivos cabem num relato, somando todos os tipos. Existe alem do limite por tipo, e nao no lugar dele: so com o limite por tipo, tres imagens mais um video passariam num projeto que so queria dois no total.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true,
                oldComment: "Sem uso: era o total de arquivos por envio, somando todos os tipos. Saiu quando o arquivo virou categoria ao lado da imagem — cada categoria tem a sua quantidade e o seu tamanho. Fica com o que cada projeto tinha escolhido; configuracao salva depois disso grava nulo.");

            migrationBuilder.AlterColumn<int>(
                name: "max_count",
                table: "project_media_kinds",
                type: "integer",
                nullable: false,
                comment: "Quantos arquivos deste tipo cabem num relato.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldComment: "Quantos arquivos deste tipo cabem em cada envio: a criacao do relato, cada resposta, cada reabertura.");

            migrationBuilder.AlterColumn<string>(
                name: "kind",
                table: "project_media_kinds",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "image ou video. Unico por configuracao entre os nao apagados. A lista cresce com o produto, e acrescentar um valor nao mexe em coluna nenhuma.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "image, file ou video (este, das linhas antigas). Unico por configuracao entre os nao apagados. A lista cresce com o produto, e acrescentar um valor nao mexe em coluna nenhuma.");
        }
    }
}
