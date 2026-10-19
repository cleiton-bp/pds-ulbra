using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInheritedIdentity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterTable(
                name: "reporter_codes",
                comment: "O codigo que quem relata guarda para reencontrar os proprios relatos, no modo sem login — e, no modo de identidade herdada, a linha da pessoa que o sistema do cliente identificou, pelo hash do sujeito. Tabela e nao coluna: o vinculo vale para varios relatos, entao a unicidade precisa de uma linha propria. Nao guarda nada de pessoa alem de um hash que nao se desfaz.",
                oldComment: "O codigo que quem relata guarda para reencontrar os proprios relatos, no modo sem login. Tabela e nao coluna: o codigo vale para varios relatos, entao a unicidade precisa de uma linha propria. Nao guarda nada de pessoa — e um identificador sorteado e nada mais.");

            migrationBuilder.AddColumn<string>(
                name: "subject_hash",
                table: "reporter_codes",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true,
                comment: "No modo de identidade herdada, o SHA-256 (hex) do sal do projeto e do sub do token: a pessoa do sistema do cliente, sem dizer quem ela e. Nulo no modo de codigo pessoal.");

            migrationBuilder.AddColumn<string>(
                name: "identity_public_key",
                table: "project_identity_settings",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true,
                comment: "A chave publica do sistema do cliente (ECDSA P-256, SPKI em base64), no modo inherited_identity: o servidor dele assina quem e a pessoa, e a API so confere. Guardada tambem nos outros modos, para a volta. E publica — nunca segredo.");

            migrationBuilder.AddColumn<bool>(
                name: "identity_required",
                table: "project_identity_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                comment: "No modo inherited_identity: true recusa o relato sem token (ou com token que nao confere) e pede para entrar no sistema; false (fabrica) aceita como protocolo, sem identidade.");

            migrationBuilder.AddColumn<string>(
                name: "identity_subject_salt",
                table: "project_identity_settings",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true,
                comment: "O sal com que o sub do token vira o subject_hash de reporter_codes. Nasce com a primeira chave e nao muda: mudar faria toda pessoa virar outra.");

            migrationBuilder.AddColumn<int>(
                name: "identity_token_max_minutes",
                table: "project_identity_settings",
                type: "integer",
                nullable: false,
                defaultValue: 15,
                comment: "Por quantos minutos, no maximo, um token do sistema do cliente pode valer (1 a 60; fabrica 15). Token de vida maior e recusado: seria um token de login disfarcado.");

            migrationBuilder.CreateIndex(
                name: "ux_reporter_codes_project_id_subject_hash",
                table: "reporter_codes",
                columns: new[] { "project_id", "subject_hash" },
                unique: true,
                filter: "deleted_at IS NULL AND subject_hash IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_reporter_codes_project_id_subject_hash",
                table: "reporter_codes");

            migrationBuilder.DropColumn(
                name: "subject_hash",
                table: "reporter_codes");

            migrationBuilder.DropColumn(
                name: "identity_public_key",
                table: "project_identity_settings");

            migrationBuilder.DropColumn(
                name: "identity_required",
                table: "project_identity_settings");

            migrationBuilder.DropColumn(
                name: "identity_subject_salt",
                table: "project_identity_settings");

            migrationBuilder.DropColumn(
                name: "identity_token_max_minutes",
                table: "project_identity_settings");

            migrationBuilder.AlterTable(
                name: "reporter_codes",
                comment: "O codigo que quem relata guarda para reencontrar os proprios relatos, no modo sem login. Tabela e nao coluna: o codigo vale para varios relatos, entao a unicidade precisa de uma linha propria. Nao guarda nada de pessoa — e um identificador sorteado e nada mais.",
                oldComment: "O codigo que quem relata guarda para reencontrar os proprios relatos, no modo sem login — e, no modo de identidade herdada, a linha da pessoa que o sistema do cliente identificou, pelo hash do sujeito. Tabela e nao coluna: o vinculo vale para varios relatos, entao a unicidade precisa de uma linha propria. Nao guarda nada de pessoa alem de um hash que nao se desfaz.");
        }
    }
}
