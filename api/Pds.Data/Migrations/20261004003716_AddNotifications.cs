using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "notify_assignment_by_email",
                table: "users",
                type: "boolean",
                nullable: false,
                // Ligado de fabrica, tambem para quem ja existia. O modelo nao leva o
                // padrao: quem nasce agora nasce com o valor da entidade.
                defaultValue: true,
                comment: "Se a pessoa recebe e-mail quando alguem do time a escolhe como responsavel por um card. Ligado de fabrica; vale em todos os projetos dela. O aviso no painel chega de qualquer jeito.");

            migrationBuilder.CreateTable(
                name: "notifications",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<long>(type: "bigint", nullable: false, comment: "Quem recebe o aviso."),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "O projeto do card, repetido para o filtro de acesso nao precisar de juncao."),
                    report_id = table.Column<long>(type: "bigint", nullable: false, comment: "O card de que o aviso fala."),
                    actor_user_id = table.Column<long>(type: "bigint", nullable: true, comment: "Quem fez: quem mencionou, ou quem escolheu o responsavel."),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "mention | assignment. A mencao so aparece no sino; a atribuicao tambem vai por e-mail, se a pessoa quiser."),
                    report_internal_comment_id = table.Column<long>(type: "bigint", nullable: true, comment: "O comentario interno da mencao. Nulo na atribuicao."),
                    read_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando a pessoa abriu ou marcou como lido, em UTC. Nulo enquanto nao leu."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notifications", x => x.id);
                    table.CheckConstraint("ck_notifications_comment", "(kind = 'mention') = (report_internal_comment_id IS NOT NULL)");
                    table.CheckConstraint("ck_notifications_kind", "kind IN ('mention', 'assignment')");
                    table.ForeignKey(
                        name: "fk_notifications_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notifications_report_internal_comment_id",
                        column: x => x.report_internal_comment_id,
                        principalTable: "report_internal_comments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notifications_reports_report_id",
                        column: x => x.report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notifications_users_actor_user_id",
                        column: x => x.actor_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notifications_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                },
                comment: "Os avisos do sino do painel: a mencao num comentario interno e a escolha como responsavel. Cada pessoa le so os proprios, e so dos projetos em que ainda esta. Interno: nenhuma rota publica le esta tabela.");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_actor_user_id",
                table: "notifications",
                column: "actor_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_deleted_at",
                table: "notifications",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_project_id",
                table: "notifications",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_report_id",
                table: "notifications",
                column: "report_id");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_report_internal_comment_id",
                table: "notifications",
                column: "report_internal_comment_id");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_user_id",
                table: "notifications",
                column: "user_id",
                filter: "deleted_at IS NULL AND read_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_user_id_created_at",
                table: "notifications",
                columns: new[] { "user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ux_notifications_public_id",
                table: "notifications",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notifications");

            migrationBuilder.DropColumn(
                name: "notify_assignment_by_email",
                table: "users");
        }
    }
}
