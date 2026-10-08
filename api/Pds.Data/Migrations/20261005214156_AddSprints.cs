using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSprints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "backlog_rank",
                table: "reports",
                type: "bigint",
                nullable: false,
                defaultValue: 0L,
                comment: "O lugar do card no backlog e nas listas das sprints; o menor fica em cima. Nasce com o numero do card vezes a folga: o novo entra no fim. Interno.");

            // Os cards que ja existem entram no backlog na ordem em que nasceram, com a
            // folga da ordem do quadro (2^20) — o mesmo lugar que o card novo ganha.
            migrationBuilder.Sql("UPDATE reports SET backlog_rank = number::bigint * 1048576;");

            migrationBuilder.AddColumn<long>(
                name: "sprint_id",
                table: "reports",
                type: "bigint",
                nullable: true,
                comment: "A sprint do card; nulo e o backlog. A subtarefa acompanha o pai (o servico confere). Interno.");

            migrationBuilder.AddColumn<decimal>(
                name: "story_points",
                table: "reports",
                type: "numeric(4,1)",
                precision: 4,
                scale: 1,
                nullable: true,
                comment: "A estimativa em pontos, de 0 a 999 com meio ponto. Nulo e sem estimativa; a subtarefa nao leva. Interno.");

            migrationBuilder.AddColumn<int>(
                name: "last_sprint_number",
                table: "projects",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                comment: "O ultimo numero de sprint dado no projeto (Sprint 3); a proxima leva este mais um. Somado numa gravacao so (UPDATE ... RETURNING), como o numero do card.");

            migrationBuilder.AddColumn<int>(
                name: "sprint_length_weeks",
                table: "project_cycle_settings",
                type: "integer",
                nullable: false,
                // Duas semanas, o padrao de fabrica, tambem para quem ja tinha o Ciclo salvo.
                defaultValue: 2,
                comment: "A duracao com que cada sprint nasce, em semanas, de 1 a 4. De fabrica 2. Cada sprint ajusta as proprias datas.");

            migrationBuilder.AddColumn<bool>(
                name: "sprints_enabled",
                table: "project_cycle_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                comment: "Se o time trabalha em sprints: o backlog aparece, o quadro mostra so a sprint em andamento, e o card ganha pontos. Desligado de fabrica; desligar nao apaga nada.");

            migrationBuilder.CreateTable(
                name: "sprints",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "O projeto da sprint."),
                    number = table.Column<int>(type: "integer", nullable: false, comment: "O numero da sprint no projeto, que da o nome de fabrica (Sprint 3). Nunca repete, nem com a apagada."),
                    name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false, comment: "O nome da sprint. De fabrica, Sprint e o numero."),
                    goal = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true, comment: "O que o time quer entregar nesta sprint. Opcional."),
                    state = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "planned | active | closed. Uma active por projeto."),
                    starts_on = table.Column<DateOnly>(type: "date", nullable: false, comment: "O primeiro dia da sprint."),
                    ends_on = table.Column<DateOnly>(type: "date", nullable: false, comment: "O ultimo dia da sprint. Nasce com a duracao padrao do projeto, e se ajusta."),
                    started_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando foi iniciada, em UTC. Nulo enquanto planejada."),
                    closed_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando foi fechada, em UTC. Nulo enquanto nao fechou."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sprints", x => x.id);
                    table.CheckConstraint("ck_sprints_dates", "ends_on >= starts_on");
                    table.CheckConstraint("ck_sprints_number", "number > 0");
                    table.CheckConstraint("ck_sprints_state", "state IN ('planned', 'active', 'closed')");
                    table.ForeignKey(
                        name: "fk_sprints_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                },
                comment: "As sprints do projeto: uma em andamento por vez — a que o quadro mostra —, as planejadas e as fechadas. Interno: nenhuma rota publica le esta tabela.");

            migrationBuilder.CreateIndex(
                name: "ix_reports_project_id_sprint_id_backlog_rank",
                table: "reports",
                columns: new[] { "project_id", "sprint_id", "backlog_rank" });

            migrationBuilder.CreateIndex(
                name: "ix_reports_sprint_id",
                table: "reports",
                column: "sprint_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_story_points",
                table: "reports",
                sql: "story_points IS NULL OR (story_points >= 0 AND story_points <= 999 AND story_points * 2 = trunc(story_points * 2))");

            migrationBuilder.CreateIndex(
                name: "ix_sprints_deleted_at",
                table: "sprints",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_sprints_project_id",
                table: "sprints",
                column: "project_id",
                unique: true,
                filter: "deleted_at IS NULL AND state = 'active'");

            migrationBuilder.CreateIndex(
                name: "ux_sprints_project_id_number",
                table: "sprints",
                columns: new[] { "project_id", "number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_sprints_public_id",
                table: "sprints",
                column: "public_id",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_reports_sprints_sprint_id",
                table: "reports",
                column: "sprint_id",
                principalTable: "sprints",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_reports_sprints_sprint_id",
                table: "reports");

            migrationBuilder.DropTable(
                name: "sprints");

            migrationBuilder.DropIndex(
                name: "ix_reports_project_id_sprint_id_backlog_rank",
                table: "reports");

            migrationBuilder.DropIndex(
                name: "ix_reports_sprint_id",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_story_points",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "backlog_rank",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "sprint_id",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "story_points",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "last_sprint_number",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "sprint_length_weeks",
                table: "project_cycle_settings");

            migrationBuilder.DropColumn(
                name: "sprints_enabled",
                table: "project_cycle_settings");
        }
    }
}
