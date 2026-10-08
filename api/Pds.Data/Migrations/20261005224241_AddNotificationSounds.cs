using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationSounds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "notify_assignment_by_email",
                table: "users");

            migrationBuilder.AddColumn<int>(
                name: "notification_volume",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 70,
                comment: "O volume do som dos avisos no painel, de 0 a 100; 70 de fabrica. O som de cada tipo de aviso fica em user_notification_sounds.");

            migrationBuilder.AlterColumn<string>(
                name: "kind",
                table: "notifications",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "mention | assignment. Os dois so no painel: no sino, com o som que a pessoa escolheu para o tipo.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "mention | assignment. A mencao so aparece no sino; a atribuicao tambem vai por e-mail, se a pessoa quiser.");

            migrationBuilder.CreateTable(
                name: "user_notification_sounds",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<long>(type: "bigint", nullable: false, comment: "A pessoa."),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "mention | assignment: o tipo de aviso, como em notifications.kind."),
                    sound = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "none | bell | drop | ping | chime | bubble | soft. O som e gerado no navegador; none e so o sino, sem som."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_notification_sounds", x => x.id);
                    table.CheckConstraint("ck_user_notification_sounds_kind", "kind IN ('mention', 'assignment')");
                    table.CheckConstraint("ck_user_notification_sounds_sound", "sound IN ('none', 'bell', 'drop', 'ping', 'chime', 'bubble', 'soft')");
                    table.ForeignKey(
                        name: "fk_user_notification_sounds_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                },
                comment: "O som que cada pessoa escolheu para cada tipo de aviso do painel. Sem linha para um tipo, vale o de fabrica. Vale em todos os projetos da pessoa. Interno.");

            migrationBuilder.AddCheckConstraint(
                name: "ck_users_notification_volume",
                table: "users",
                sql: "notification_volume >= 0 AND notification_volume <= 100");

            migrationBuilder.CreateIndex(
                name: "ix_user_notification_sounds_deleted_at",
                table: "user_notification_sounds",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_user_notification_sounds_public_id",
                table: "user_notification_sounds",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_user_notification_sounds_user_id_kind",
                table: "user_notification_sounds",
                columns: new[] { "user_id", "kind" },
                unique: true,
                filter: "deleted_at IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_notification_sounds");

            migrationBuilder.DropCheckConstraint(
                name: "ck_users_notification_volume",
                table: "users");

            migrationBuilder.DropColumn(
                name: "notification_volume",
                table: "users");

            migrationBuilder.AddColumn<bool>(
                name: "notify_assignment_by_email",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: true,
                comment: "Se a pessoa recebe e-mail quando alguem do time a escolhe como responsavel por um card. Ligado de fabrica; vale em todos os projetos dela. O aviso no painel chega de qualquer jeito.");

            migrationBuilder.AlterColumn<string>(
                name: "kind",
                table: "notifications",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "mention | assignment. A mencao so aparece no sino; a atribuicao tambem vai por e-mail, se a pessoa quiser.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "mention | assignment. Os dois so no painel: no sino, com o som que a pessoa escolheu para o tipo.");
        }
    }
}
