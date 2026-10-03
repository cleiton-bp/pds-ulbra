using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <summary>
    /// O convite para o time: uma tabela de convites, que guarda so o hash do link e onde
    /// esta o e-mail (o texto nao e guardado), e a configuracao do time, com o prazo do
    /// convite. Os usuarios ganham o "e-mail confirmado pelo Google", que aceitar exige —
    /// e que comeca falso para todos: cada um passa a ter o valor certo no proximo login.
    /// Os eventos ganham os tipos do time, so no comentario da coluna.
    /// </summary>
    public partial class AddProjectInvitations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "email_verified",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                comment: "Se o Google confirmou, no ultimo login, que a pessoa e dona do e-mail. Aceitar convite exige: e o que faz o e-mail do convite querer dizer a mesma pessoa.");

            migrationBuilder.AlterColumn<string>(
                name: "type",
                table: "events",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                comment: "O que aconteceu, em snake_case: os do relato (report_*) e os do time (project_invitation_*, project_member_*). A lista cresce conforme o produto anda.",
                oldClrType: typeof(string),
                oldType: "character varying(40)",
                oldMaxLength: 40,
                oldComment: "report_created | report_viewed por enquanto. A lista cresce conforme o produto anda.");

            migrationBuilder.CreateTable(
                name: "project_invitations",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto para o qual a pessoa foi convidada."),
                    email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false, comment: "Endereco convidado, em minusculas. Aceitar exige o Google confirmando este mesmo endereco."),
                    role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "member | administrator. O papel com que a pessoa entra ao aceitar."),
                    invited_by_user_id = table.Column<long>(type: "bigint", nullable: false, comment: "Quem convidou. O nome vai no e-mail."),
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true, comment: "SHA-256 do link que esta valendo, em hexadecimal. Nulo enquanto o e-mail nao foi montado; trocado a cada reenvio, o que invalida o link anterior."),
                    expires_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ate quando o convite vale, em UTC. Nasce do prazo da configuracao do time; reenviar renova."),
                    accepted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando a pessoa aceitou. Preenchido, o convite fechou."),
                    accepted_by_user_id = table.Column<long>(type: "bigint", nullable: true, comment: "Quem aceitou — a pessoa que entrou no time."),
                    revoked_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando um administrador cancelou. Preenchido, o convite fechou e o link deixa de valer."),
                    email_status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "pending | sending | sent | failed. Onde esta o e-mail do convite — o unico registro do envio: o texto do e-mail nao e guardado."),
                    email_attempted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando o envio foi tentado pela ultima vez."),
                    email_sent_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando o servidor de e-mail aceitou a mensagem."),
                    email_error = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true, comment: "Por que o e-mail nao saiu: o tipo da falha, e nunca a mensagem do servidor, que costuma repetir o endereco de quem recebe."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_invitations", x => x.id);
                    table.CheckConstraint("ck_project_invitations_email_status", "email_status IN ('pending', 'sending', 'sent', 'failed')");
                    table.CheckConstraint("ck_project_invitations_role", "role IN ('member', 'administrator')");
                    table.ForeignKey(
                        name: "fk_project_invitations_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_project_invitations_users_accepted_by_user_id",
                        column: x => x.accepted_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_project_invitations_users_invited_by_user_id",
                        column: x => x.invited_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                },
                comment: "Convites para entrar no time de um projeto, com o papel. O link de aceitar nunca e guardado: nasce na hora de montar o e-mail, e aqui fica so o hash dele. Aceitar exige entrar com o Google do mesmo endereco. Aberto e o convite nem aceito nem cancelado; vencido continua aberto, para poder ser reenviado.");

            migrationBuilder.CreateTable(
                name: "project_team_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1."),
                    invitation_validity_days = table.Column<int>(type: "integer", nullable: false, comment: "Por quantos dias um convite vale, a contar do envio. De 1 a 30; padrao 7."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_team_settings", x => x.id);
                    table.CheckConstraint("ck_project_team_settings_invitation_validity", "invitation_validity_days >= 1 AND invitation_validity_days <= 30");
                    table.ForeignKey(
                        name: "fk_project_team_settings_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Como o time trabalha neste projeto: por enquanto, o prazo do convite. Uma linha por projeto, criada so quando alguem salva — os padroes vivem no codigo, e projeto sem linha e projeto que nunca precisou mudar nada.");

            migrationBuilder.CreateIndex(
                name: "ix_project_invitations_accepted_by_user_id",
                table: "project_invitations",
                column: "accepted_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_project_invitations_deleted_at",
                table: "project_invitations",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_invitations_email_status",
                table: "project_invitations",
                column: "email_status",
                filter: "email_status IN ('pending', 'sending')");

            migrationBuilder.CreateIndex(
                name: "ix_project_invitations_invited_by_user_id",
                table: "project_invitations",
                column: "invited_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_invitations_project_id_email",
                table: "project_invitations",
                columns: new[] { "project_id", "email" },
                unique: true,
                filter: "deleted_at IS NULL AND accepted_at IS NULL AND revoked_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_invitations_public_id",
                table: "project_invitations",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_project_invitations_token_hash",
                table: "project_invitations",
                column: "token_hash",
                unique: true,
                filter: "token_hash IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_project_team_settings_deleted_at",
                table: "project_team_settings",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_project_team_settings_project_id",
                table: "project_team_settings",
                column: "project_id",
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_team_settings_public_id",
                table: "project_team_settings",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_invitations");

            migrationBuilder.DropTable(
                name: "project_team_settings");

            migrationBuilder.DropColumn(
                name: "email_verified",
                table: "users");

            migrationBuilder.AlterColumn<string>(
                name: "type",
                table: "events",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                comment: "report_created | report_viewed por enquanto. A lista cresce conforme o produto anda.",
                oldClrType: typeof(string),
                oldType: "character varying(40)",
                oldMaxLength: 40,
                oldComment: "O que aconteceu, em snake_case: os do relato (report_*) e os do time (project_invitation_*, project_member_*). A lista cresce conforme o produto anda.");
        }
    }
}
