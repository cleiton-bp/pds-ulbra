using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <summary>
    /// Quem pode ver os relatos, junto do modo de identificacao — na mesma tabela,
    /// porque o modo decide o que a visibilidade pode ser.
    /// </summary>
    /// <remarks>
    /// <para><b>Entra em tres passos, e nao com valor padrao de coluna.</b> A coluna
    /// e obrigatoria, e o projeto que ja salvou o modo nao tem visibilidade
    /// nenhuma: nasce anulavel, recebe <c>private</c> em todas as linhas, e so
    /// entao vira obrigatoria. O padrao de coluna e retirado no fim de proposito —
    /// os padroes vivem em <c>IdentitySettingsDefaults</c>, e deixa-lo no banco
    /// criaria um segundo lugar que ninguem lembraria de mudar junto.</para>
    ///
    /// <para><b>O valor do preenchimento e o mais fechado.</b> Linha que existia
    /// antes desta coluna e projeto que nunca escolheu visibilidade nenhuma —
    /// assumir publico seria publicar por conta propria o texto livre de quem
    /// relatou.</para>
    /// </remarks>
    public partial class AddProjectVisibility : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "visibility",
                table: "project_identity_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true,
                comment: "private, public_anonymous ou public_identified. Padrao private. public_identified so vale onde o modo identifica — sem identidade nao ha o que mostrar. Gravar publico nao publica nada sozinho: a lista publica so existe atras da fila de moderacao.");

            migrationBuilder.Sql("UPDATE project_identity_settings SET visibility = 'private' WHERE visibility IS NULL;");

            migrationBuilder.Sql("ALTER TABLE project_identity_settings ALTER COLUMN visibility SET NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "visibility",
                table: "project_identity_settings");
        }
    }
}
