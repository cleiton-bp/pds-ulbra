using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class FixReporterCodeComment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "code",
                table: "reporter_codes",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                comment: "O codigo no formato do protocolo, sorteado inteiro pelo sistema. Codigo apresentado de fora nunca e consultado para dizer se existe: qualquer diferenca entre livre e ocupado vira enumeracao. Na geracao a consulta existe, e nao conta nada — o candidato foi sorteado por nos.",
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32,
                oldComment: "O codigo no formato do protocolo, sorteado inteiro pelo sistema. Nunca se consulta se ele existe: qualquer diferenca entre livre e ocupado vira enumeracao.");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "code",
                table: "reporter_codes",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                comment: "O codigo no formato do protocolo, sorteado inteiro pelo sistema. Nunca se consulta se ele existe: qualquer diferenca entre livre e ocupado vira enumeracao.",
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32,
                oldComment: "O codigo no formato do protocolo, sorteado inteiro pelo sistema. Codigo apresentado de fora nunca e consultado para dizer se existe: qualquer diferenca entre livre e ocupado vira enumeracao. Na geracao a consulta existe, e nao conta nada — o candidato foi sorteado por nos.");
        }
    }
}
