using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddIdentityFormat : Migration
    {
        // O formato da assinatura passa a ser do projeto. Antes so existia o JWT, entao toda
        // linha que ja existe nasce "jwt": quem ja tinha colado a chave publica continua
        // funcionando sem tocar em nada. O padrao de fabrica (hmac) mora no codigo, em
        // IdentitySettingsDefaults; o DEFAULT da coluna so preenche as linhas antigas e sai.
        //
        // A versao da chave secreta nasce 1 e fica com o DEFAULT, como a validade do cracha.

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "identity_format",
                table: "project_identity_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "jwt",
                comment: "hmac | jwt. Como o sistema do cliente assina o cracha no modo inherited_identity. So um vale por vez.");

            migrationBuilder.AddColumn<int>(
                name: "identity_secret_version",
                table: "project_identity_settings",
                type: "integer",
                nullable: false,
                defaultValue: 1,
                comment: "A versao da chave secreta do HMAC. A chave nao e guardada: sai da chave mestra da instalacao (IDENTITY_HMAC_KEY) e desta versao; subir a versao troca a chave.");

            migrationBuilder.Sql("ALTER TABLE project_identity_settings ALTER COLUMN identity_format DROP DEFAULT;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "identity_format",
                table: "project_identity_settings");

            migrationBuilder.DropColumn(
                name: "identity_secret_version",
                table: "project_identity_settings");
        }
    }
}
