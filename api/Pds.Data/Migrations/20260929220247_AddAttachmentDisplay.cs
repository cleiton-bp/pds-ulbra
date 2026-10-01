using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <summary>
    /// A imagem no relato, do jeito que a pessoa montou: o tamanho em que ela aparece
    /// logo abaixo do texto, e a posicao dela no envio. Os anexos que ja estavam
    /// guardados ficam com a linha inteira — o padrao de fabrica — e na posicao zero, e
    /// a hora de chegada continua decidindo a ordem deles.
    /// </summary>
    public partial class AddAttachmentDisplay : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Anulavel, preenchida, e so entao obrigatoria: o padrao mora no codigo, e
            // nao na coluna. Um valor padrao aqui continuaria valendo para as linhas
            // novas depois de alguem mudar de ideia no codigo.
            migrationBuilder.AddColumn<string>(
                name: "display_size",
                table: "report_attachments",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true,
                comment: "Em que tamanho a imagem aparece logo abaixo do texto: small (um terco da linha), medium (meia), large (tres quartos) ou full (a linha inteira). Fracao da largura do texto, e nao pixels, para o relato montado no quadro aparecer do mesmo jeito no painel e no acompanhamento. Escolha de quem relata; nao muda depois do envio.");

            migrationBuilder.Sql("UPDATE report_attachments SET display_size = 'full' WHERE display_size IS NULL;");

            migrationBuilder.Sql("ALTER TABLE report_attachments ALTER COLUMN display_size SET NOT NULL;");

            migrationBuilder.AddColumn<int>(
                name: "display_order",
                table: "report_attachments",
                type: "integer",
                nullable: true,
                comment: "A posicao da imagem no envio, a partir de zero: a ordem em que a pessoa as montou. Guardada, e nao deduzida da hora de chegada — o arquivo tentado de novo chega depois dos outros. Vale dentro de um envio; a hora de chegada desempata.");

            migrationBuilder.Sql("UPDATE report_attachments SET display_order = 0 WHERE display_order IS NULL;");

            migrationBuilder.Sql("ALTER TABLE report_attachments ALTER COLUMN display_order SET NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "display_order",
                table: "report_attachments");

            migrationBuilder.DropColumn(
                name: "display_size",
                table: "report_attachments");
        }
    }
}
