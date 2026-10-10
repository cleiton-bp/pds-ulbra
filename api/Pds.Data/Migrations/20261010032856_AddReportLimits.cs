using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportLimits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_user_notification_sounds_kind",
                table: "user_notification_sounds");

            migrationBuilder.DropCheckConstraint(
                name: "ck_notifications_kind",
                table: "notifications");

            migrationBuilder.AlterTable(
                name: "notifications",
                comment: "Os avisos do sino do painel: a mencao num comentario interno, a escolha como responsavel, o endereco novo que mandou relato e os envios pausados por excesso. Cada pessoa le so os proprios, e so dos projetos em que ainda esta. Interno: nenhuma rota publica le esta tabela.",
                oldComment: "Os avisos do sino do painel: a mencao num comentario interno e a escolha como responsavel. Cada pessoa le so os proprios, e so dos projetos em que ainda esta. Interno: nenhuma rota publica le esta tabela.");

            migrationBuilder.AlterColumn<string>(
                name: "kind",
                table: "user_notification_sounds",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "mention | assignment | origin_pending | reports_paused: o tipo de aviso, como em notifications.kind.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "mention | assignment: o tipo de aviso, como em notifications.kind.");

            migrationBuilder.AddColumn<DateTime>(
                name: "held_for_origin_at",
                table: "reports",
                type: "timestamp without time zone",
                nullable: true,
                comment: "Quando o relato chegou de um endereco fora da lista de autorizados e ficou retido. Nulo e aceito. Retido: quem relatou acompanha como sempre, e o time nao o ve em lugar nenhum alem de Aguardando liberacao. Autorizar o endereco zera; bloquear apaga o relato de vez.");

            migrationBuilder.AlterColumn<long>(
                name: "report_id",
                table: "notifications",
                type: "bigint",
                nullable: true,
                comment: "O card de que o aviso fala. Nulo nos avisos do projeto (origin_pending, reports_paused).",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldComment: "O card de que o aviso fala.");

            migrationBuilder.AlterColumn<string>(
                name: "kind",
                table: "notifications",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "mention | assignment | origin_pending | reports_paused. Todos so no painel: no sino, com o som que a pessoa escolheu para o tipo. Os dois ultimos vao para quem administra o projeto.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "mention | assignment. Os dois so no painel: no sino, com o som que a pessoa escolheu para o tipo.");

            migrationBuilder.AddColumn<string>(
                name: "limit_scope",
                table: "notifications",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true,
                comment: "reporter | ip | origin | project: a camada que pausou os envios. So no aviso reports_paused.");

            migrationBuilder.AddColumn<DateTime>(
                name: "paused_until",
                table: "notifications",
                type: "timestamp without time zone",
                nullable: true,
                comment: "Ate quando os envios ficam pausados, em UTC. So no aviso reports_paused.");

            migrationBuilder.AddColumn<string>(
                name: "subject",
                table: "notifications",
                type: "character varying(260)",
                maxLength: 260,
                nullable: true,
                comment: "O endereco de que o aviso do projeto fala: o que mandou relato sem estar autorizado, ou o pausado por excesso. Nunca um IP: a pausa por IP ou por pessoa diz so a camada.");

            migrationBuilder.CreateTable(
                name: "project_report_limits",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1."),
                    per_reporter = table.Column<int>(type: "integer", nullable: false, comment: "Relatos da mesma pessoa a cada 10 minutos. Padrao 5. A pessoa e o codigo pessoal, no projeto que usa esse modo e quando ele vem; senao, o IP."),
                    per_ip_per_hour = table.Column<int>(type: "integer", nullable: false, comment: "Relatos do mesmo IP por hora. Padrao 20."),
                    per_origin_per_hour = table.Column<int>(type: "integer", nullable: false, comment: "Relatos do mesmo endereco de origem por hora. Padrao 200. A origem e declarada pela pagina: por isso as camadas de IP e de projeto existem."),
                    per_project_per_hour = table.Column<int>(type: "integer", nullable: false, comment: "Relatos do projeto inteiro por hora. Padrao 300."),
                    per_project_per_day = table.Column<int>(type: "integer", nullable: false, comment: "Relatos do projeto inteiro nas ultimas 24 horas. Padrao 2000."),
                    min_interval_seconds = table.Column<int>(type: "integer", nullable: false, comment: "Segundos minimos entre dois relatos da mesma pessoa ou do mesmo IP. Padrao 30; zero desliga. Antes disso a recusa e direta, sem desafio."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_report_limits", x => x.id);
                    table.CheckConstraint("ck_project_report_limits_ranges", "per_reporter BETWEEN 1 AND 50 AND per_ip_per_hour BETWEEN 1 AND 200 AND per_origin_per_hour BETWEEN 1 AND 2000 AND per_project_per_hour BETWEEN 1 AND 3000 AND per_project_per_day BETWEEN 1 AND 20000 AND min_interval_seconds BETWEEN 0 AND 300");
                    table.ForeignKey(
                        name: "fk_project_report_limits_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Quantos relatos o projeto aceita em pouco tempo, por camada: quem relata, IP, endereco de origem e o projeto inteiro, e o intervalo minimo entre dois. Uma linha por projeto, criada so quando alguem salva — os padroes e os tetos vivem no codigo. Nenhum IP e guardado: as contagens vivem na memoria do processo.");

            migrationBuilder.AddCheckConstraint(
                name: "ck_user_notification_sounds_kind",
                table: "user_notification_sounds",
                sql: "kind IN ('mention', 'assignment', 'origin_pending', 'reports_paused')");

            migrationBuilder.CreateIndex(
                name: "ix_reports_project_id_held_for_origin_at",
                table: "reports",
                columns: new[] { "project_id", "held_for_origin_at" },
                filter: "held_for_origin_at IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_notifications_kind",
                table: "notifications",
                sql: "kind IN ('mention', 'assignment', 'origin_pending', 'reports_paused')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_notifications_paused",
                table: "notifications",
                sql: "(kind = 'reports_paused') = (limit_scope IS NOT NULL AND paused_until IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_notifications_report",
                table: "notifications",
                sql: "(kind IN ('mention', 'assignment')) = (report_id IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "ix_project_report_limits_deleted_at",
                table: "project_report_limits",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_project_report_limits_project_id",
                table: "project_report_limits",
                column: "project_id",
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_report_limits_public_id",
                table: "project_report_limits",
                column: "public_id",
                unique: true);
            // **O projeto que ja existe nao muda de comportamento.** Ate aqui, a lista de
            // autorizados vazia aceitava qualquer endereco; daqui em diante, o relato de
            // um endereco fora dela fica retido. Para nenhum projeto acordar com o
            // proximo relato do proprio site retido, cada endereco que ja mandou relato
            // entra na lista do projeto — na forma em que a API compara (minusculo, sem
            // esquema, sem caminho), so o que e dominio valido, sem repetir o que ja esta
            // nela nem o que esta bloqueado, e no maximo ate 50 por projeto (o teto da
            // lista), os mais recentes primeiro. Os relatos que ja existem nunca ficam
            // retidos: a coluna nova nasce nula.
            migrationBuilder.Sql("""
                WITH origens AS (
                    SELECT r.project_id,
                           rtrim(split_part(split_part(split_part(
                               regexp_replace(lower(btrim(r.origin)), '^[a-z][a-z0-9+.-]*://|^//', ''),
                               '/', 1), '?', 1), '#', 1), '.') AS domain,
                           r.created_at
                    FROM reports AS r
                    WHERE r.kind = 'report' AND r.origin IS NOT NULL AND btrim(r.origin) <> ''
                ),
                validas AS (
                    SELECT o.project_id, o.domain, max(o.created_at) AS last_at
                    FROM origens AS o
                    WHERE length(o.domain) BETWEEN 1 AND 260
                      AND o.domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$'
                      AND NOT EXISTS (SELECT 1 FROM project_origins AS po
                                      WHERE po.project_id = o.project_id AND po.domain = o.domain AND po.deleted_at IS NULL)
                      AND NOT EXISTS (SELECT 1 FROM project_blocked_origins AS b
                                      WHERE b.project_id = o.project_id AND b.domain = o.domain AND b.deleted_at IS NULL)
                    GROUP BY o.project_id, o.domain
                ),
                numeradas AS (
                    SELECT v.project_id, v.domain,
                           row_number() OVER (PARTITION BY v.project_id ORDER BY v.last_at DESC, v.domain) AS n,
                           (SELECT count(*) FROM project_origins AS po
                            WHERE po.project_id = v.project_id AND po.deleted_at IS NULL) AS existentes
                    FROM validas AS v
                )
                INSERT INTO project_origins (project_id, domain, allows_subdomains, public_id, created_at, updated_at)
                SELECT project_id, domain, false, gen_random_uuid(), now() AT TIME ZONE 'utc', now() AT TIME ZONE 'utc'
                FROM numeradas
                WHERE n + existentes <= 50;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Os avisos do projeto nao cabem no esquema de antes (o card era obrigatorio,
            // e os tipos eram dois): saem, e o som escolhido para eles tambem. Os relatos
            // retidos passam a aparecer no Trabalho — o esquema de antes nao tinha como
            // rete-los. Os enderecos levados para a lista de autorizados ficam: nao ha
            // como separa-los dos que o time pos.
            migrationBuilder.Sql("""
                DELETE FROM notifications WHERE kind IN ('origin_pending', 'reports_paused') OR report_id IS NULL;
                DELETE FROM user_notification_sounds WHERE kind IN ('origin_pending', 'reports_paused');
                """);

            migrationBuilder.DropTable(
                name: "project_report_limits");

            migrationBuilder.DropCheckConstraint(
                name: "ck_user_notification_sounds_kind",
                table: "user_notification_sounds");

            migrationBuilder.DropIndex(
                name: "ix_reports_project_id_held_for_origin_at",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_notifications_kind",
                table: "notifications");

            migrationBuilder.DropCheckConstraint(
                name: "ck_notifications_paused",
                table: "notifications");

            migrationBuilder.DropCheckConstraint(
                name: "ck_notifications_report",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "held_for_origin_at",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "limit_scope",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "paused_until",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "subject",
                table: "notifications");

            migrationBuilder.AlterTable(
                name: "notifications",
                comment: "Os avisos do sino do painel: a mencao num comentario interno e a escolha como responsavel. Cada pessoa le so os proprios, e so dos projetos em que ainda esta. Interno: nenhuma rota publica le esta tabela.",
                oldComment: "Os avisos do sino do painel: a mencao num comentario interno, a escolha como responsavel, o endereco novo que mandou relato e os envios pausados por excesso. Cada pessoa le so os proprios, e so dos projetos em que ainda esta. Interno: nenhuma rota publica le esta tabela.");

            migrationBuilder.AlterColumn<string>(
                name: "kind",
                table: "user_notification_sounds",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "mention | assignment: o tipo de aviso, como em notifications.kind.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "mention | assignment | origin_pending | reports_paused: o tipo de aviso, como em notifications.kind.");

            migrationBuilder.AlterColumn<long>(
                name: "report_id",
                table: "notifications",
                type: "bigint",
                nullable: false,
                // Sem valor padrao: os avisos sem card ja sairam acima, e o 0 que o EF poe
                // aqui ficava no esquema (DEFAULT 0) e voltava na subida seguinte.
                comment: "O card de que o aviso fala.",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true,
                oldComment: "O card de que o aviso fala. Nulo nos avisos do projeto (origin_pending, reports_paused).");

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
                oldComment: "mention | assignment | origin_pending | reports_paused. Todos so no painel: no sino, com o som que a pessoa escolheu para o tipo. Os dois ultimos vao para quem administra o projeto.");

            migrationBuilder.AddCheckConstraint(
                name: "ck_user_notification_sounds_kind",
                table: "user_notification_sounds",
                sql: "kind IN ('mention', 'assignment')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_notifications_kind",
                table: "notifications",
                sql: "kind IN ('mention', 'assignment')");
        }
    }
}
