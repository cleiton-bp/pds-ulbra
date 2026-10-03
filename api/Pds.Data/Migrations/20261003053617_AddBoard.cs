using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBoard : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "board_rank",
                table: "reports",
                type: "bigint",
                nullable: false,
                defaultValue: 0L,
                comment: "O lugar do card na coluna do quadro; o menor fica em cima. So se compara dentro da mesma coluna. Com folga entre vizinhos: por um card entre dois escolhe um numero no meio, e a coluna e renumerada quando a folga acaba.");

            migrationBuilder.AddColumn<DateTime>(
                name: "state_changed_at",
                table: "reports",
                type: "timestamp without time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified),
                comment: "Quando o card entrou na coluna em que esta, ou voltou a ela (reaberto, ou desarquivado por quem relatou), em UTC. A ultima coluna do quadro mostra so o que entrou nela nos ultimos dias do projeto.");

            migrationBuilder.AddColumn<long>(
                name: "board_top_rank",
                table: "projects",
                type: "bigint",
                nullable: false,
                defaultValue: 0L,
                comment: "O lugar do ultimo card posto no topo de uma coluna do quadro: o que chega sem ser arrastado, ou o que foi solto no topo. O proximo fica uma folga acima. So desce, numa gravacao so (UPDATE ... RETURNING): o card que chega fica acima de tudo sem ler a coluna.");

            migrationBuilder.AddColumn<int>(
                name: "due_soon_days",
                table: "project_cycle_settings",
                type: "integer",
                nullable: false,
                defaultValue: 2,
                comment: "Faltando ate quantos dias o prazo do card fica em destaque no quadro e na lista. Zero destaca so no proprio dia. De fabrica 2.");

            migrationBuilder.AddColumn<int>(
                name: "last_column_visible_days",
                table: "project_cycle_settings",
                type: "integer",
                nullable: false,
                defaultValue: 14,
                comment: "Quantos dias a ultima coluna do quadro mostra; o card que entrou nela ha mais tempo continua na lista. Zero mostra todos. De fabrica 14, como nos quadros Kanban.");

            migrationBuilder.CreateIndex(
                name: "ix_reports_project_id_project_state_id_board_rank",
                table: "reports",
                columns: new[] { "project_id", "project_state_id", "board_rank" });

            // A ordem de cada coluna comeca sendo a de hoje: do mais recente para o mais
            // antigo, com a folga inteira (2^20) entre vizinhos. O mais recente fica no
            // lugar zero, e o topo do projeto, que comeca em zero, so desce: o primeiro
            // card que chegar fica acima de todos. A folga vai escrita, e nao lida do
            // codigo: esta migracao tem de fazer amanha o mesmo que faz hoje.
            //
            // Quando o card entrou na coluna: o ultimo movimento dele (do time ou da
            // reabertura, que tambem grava o movimento), senao a criacao.
            //
            // E os padroes que so serviam para preencher saem: as regras do Ciclo moram
            // no codigo (CycleSettingsDefaults), e a ordem e a hora de entrada sempre
            // vem de quem grava o card.
            migrationBuilder.Sql("""
                UPDATE reports AS r
                SET board_rank = o.new_rank
                FROM (SELECT id,
                             (row_number() OVER (PARTITION BY project_id, project_state_id
                                                 ORDER BY created_at DESC, id DESC) - 1) * 1048576 AS new_rank
                      FROM reports) AS o
                WHERE r.id = o.id;

                UPDATE reports AS r
                SET state_changed_at = coalesce(
                    (SELECT max(e.occurred_at) FROM events AS e
                     WHERE e.report_id = r.id AND e.type = 'report_state_changed'),
                    r.created_at);

                ALTER TABLE reports ALTER COLUMN board_rank DROP DEFAULT;
                ALTER TABLE reports ALTER COLUMN state_changed_at DROP DEFAULT;
                ALTER TABLE project_cycle_settings ALTER COLUMN due_soon_days DROP DEFAULT;
                ALTER TABLE project_cycle_settings ALTER COLUMN last_column_visible_days DROP DEFAULT;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_reports_project_id_project_state_id_board_rank",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "board_rank",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "state_changed_at",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "board_top_rank",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "due_soon_days",
                table: "project_cycle_settings");

            migrationBuilder.DropColumn(
                name: "last_column_visible_days",
                table: "project_cycle_settings");
        }
    }
}
