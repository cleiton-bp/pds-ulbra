using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddIdentitySecretRotations : Migration
    {
        // O historico das trocas da chave secreta do HMAC, so com a data. As linhas que ja
        // existem nascem com a lista vazia (ninguem trocou ainda pelo historico), e o DEFAULT
        // sai logo depois, como nas outras colunas: o padrao mora no codigo.

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<List<DateTime>>(
                name: "identity_secret_rotations",
                table: "project_identity_settings",
                type: "timestamp with time zone[]",
                nullable: false,
                defaultValueSql: "'{}'",
                comment: "Quando a chave secreta do HMAC foi trocada, da mais recente para a mais antiga, ate 3. So a data: o historico mostra o comeco de cada chave antiga, que sai da chave mestra e da versao.");

            migrationBuilder.Sql("ALTER TABLE project_identity_settings ALTER COLUMN identity_secret_rotations DROP DEFAULT;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "identity_secret_rotations",
                table: "project_identity_settings");
        }
    }
}
