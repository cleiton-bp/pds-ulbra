using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchableText : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "searchable_text",
                table: "reports",
                type: "text",
                nullable: true,
                computedColumnSql: "lower(translate(coalesce(title, '') || chr(1) || coalesce(reporter_title, '') || chr(1) || coalesce(text, '') || chr(1) || coalesce(description, ''), 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ', 'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY'))",
                stored: true,
                comment: "O card como a busca o compara: titulo, titulo de quem relatou, texto e descricao, sem acento e em minusculas. Coluna gerada pelo banco a cada gravacao; a aplicacao nunca escreve nela.");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "searchable_text",
                table: "reports");
        }
    }
}
