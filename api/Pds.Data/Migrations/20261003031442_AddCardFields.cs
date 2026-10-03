using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <summary>
    /// O card ganha titulo de quem relatou, responsavel, prioridade, etiquetas e prazo;
    /// a ferramenta ganha a pergunta do titulo.
    ///
    /// <para><b>Todo projeto que ja existe ganha as quatro prioridades de fabrica</b>
    /// (Baixa, Media, Alta, Urgente) — as mesmas que o projeto novo ganha ao nascer. Os
    /// cards continuam sem prioridade: escolher e do time.</para>
    ///
    /// <para><b>A volta apaga os eventos dos campos novos</b>, que o modelo antigo nao
    /// sabe ler, e o titulo que o time reescreveu nos relatos: no modelo antigo o
    /// titulo e so do card do time.</para>
    /// </summary>
    public partial class AddCardFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_team_fields",
                table: "reports");

            migrationBuilder.AlterColumn<string>(
                name: "title",
                table: "reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true,
                comment: "Titulo do time. Obrigatorio no card do time; no relato, o que o time reescreveu, nulo ate alguem reescrever. Interno: nenhuma rota publica o devolve.",
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldNullable: true,
                oldComment: "Titulo do card do time. Nulo no relato.");

            migrationBuilder.AddColumn<long>(
                name: "assignee_user_id",
                table: "reports",
                type: "bigint",
                nullable: true,
                comment: "Quem do time esta com o card; um so. Quem sai do time continua aqui, como registro, e o painel o marca como fora do time. Interno.");

            migrationBuilder.AddColumn<DateOnly>(
                name: "due_date",
                table: "reports",
                type: "date",
                nullable: true,
                comment: "O prazo: so a data, sem hora. Nulo e sem prazo. Interno.");

            migrationBuilder.AddColumn<long>(
                name: "priority_id",
                table: "reports",
                type: "bigint",
                nullable: true,
                comment: "A prioridade do projeto que o time escolheu. Nulo e sem prioridade, e e como o card nasce. Interno.");

            migrationBuilder.AddColumn<string>(
                name: "reporter_title",
                table: "reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true,
                comment: "O titulo que a pessoa escreveu na ferramenta. Nunca muda, e e o unico titulo que volta para ela. Nulo quando ela nao respondeu, e sempre no card do time.");

            migrationBuilder.AddColumn<string>(
                name: "report_title_mode",
                table: "project_widget_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "optional",
                comment: "optional | required | hidden. Como a ferramenta pergunta o titulo (\"em poucas palavras, o que aconteceu?\"). Obrigatoria, a API recusa o relato sem ele.");

            migrationBuilder.CreateTable(
                name: "project_labels",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono da etiqueta."),
                    name = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false, comment: "O nome. Unico no projeto, sem diferenciar maiuscula de minuscula (conferido no servico)."),
                    color = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "gray | blue | green | yellow | orange | red | purple | pink. Paleta fixa, como a da prioridade."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_labels", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_labels_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "As etiquetas de cada projeto. O time cria ao etiquetar um card; o administrador renomeia, troca a cor e apaga. Apagar tira a etiqueta de todos os cards; os eventos guardam o nome da epoca.");

            migrationBuilder.CreateTable(
                name: "project_priorities",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono da prioridade."),
                    name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false, comment: "Nome dado pelo time. Renomear nao reescreve o passado: o evento guarda o nome que valia na epoca."),
                    color = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "gray | blue | green | yellow | orange | red | purple | pink. Paleta fixa: cada cor tem o par certo no tema claro e no escuro."),
                    position = table.Column<int>(type: "integer", nullable: false, comment: "Ordem na tela, da menos para a mais urgente, escolhida pelo time."),
                    deactivated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto a prioridade pode ser escolhida; preenchido para aposenta-la sem apagar, porque card antigo continua apontando para ela."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_priorities", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_priorities_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "As prioridades de cada projeto, com os nomes que o time deu. Nasce com quatro de fabrica (Baixa, Media, Alta, Urgente); o administrador renomeia, troca a cor, reordena ou cria outras, como faz com os estados.");

            migrationBuilder.CreateTable(
                name: "report_labels",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    report_id = table.Column<long>(type: "bigint", nullable: false, comment: "O card etiquetado."),
                    project_label_id = table.Column<long>(type: "bigint", nullable: false, comment: "A etiqueta, do mesmo projeto do card."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_report_labels", x => x.id);
                    table.ForeignKey(
                        name: "fk_report_labels_project_labels_project_label_id",
                        column: x => x.project_label_id,
                        principalTable: "project_labels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_report_labels_reports_report_id",
                        column: x => x.report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "As etiquetas de cada card, um par por linha. Interno: nenhuma rota publica le esta tabela.");

            migrationBuilder.CreateIndex(
                name: "ix_reports_assignee_user_id",
                table: "reports",
                column: "assignee_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_reports_priority_id",
                table: "reports",
                column: "priority_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_team_fields",
                table: "reports",
                sql: "kind <> 'team' OR (title IS NOT NULL AND tracking_code IS NULL AND access_token_hash IS NULL AND reporter_code_id IS NULL AND project_public_stage_id IS NULL AND public_stage_due_at IS NULL AND moderation_state = 'pending' AND type IS NULL AND text IS NULL AND reporter_title IS NULL)");

            migrationBuilder.CreateIndex(
                name: "ix_project_labels_deleted_at",
                table: "project_labels",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_labels_project_id",
                table: "project_labels",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_labels_project_id_name",
                table: "project_labels",
                columns: new[] { "project_id", "name" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_labels_public_id",
                table: "project_labels",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_project_priorities_deleted_at",
                table: "project_priorities",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_priorities_project_id",
                table: "project_priorities",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_priorities_project_id_name",
                table: "project_priorities",
                columns: new[] { "project_id", "name" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_priorities_public_id",
                table: "project_priorities",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_report_labels_deleted_at",
                table: "report_labels",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_report_labels_project_label_id",
                table: "report_labels",
                column: "project_label_id");

            migrationBuilder.CreateIndex(
                name: "ux_report_labels_public_id",
                table: "report_labels",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_report_labels_report_id_project_label_id",
                table: "report_labels",
                columns: new[] { "report_id", "project_label_id" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.AddForeignKey(
                name: "fk_reports_project_priorities_priority_id",
                table: "reports",
                column: "priority_id",
                principalTable: "project_priorities",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_reports_users_assignee_user_id",
                table: "reports",
                column: "assignee_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            // O padrao so serviu para as linhas que ja existiam nascerem com a pergunta
            // opcional; dai em diante quem grava diz o modo, como em toda coluna da
            // ferramenta. E as prioridades de fabrica para todo projeto que ja existe,
            // na ordem da menos para a mais urgente.
            migrationBuilder.Sql("""
                ALTER TABLE project_widget_settings ALTER COLUMN report_title_mode DROP DEFAULT;

                INSERT INTO project_priorities (project_id, name, color, position, public_id, created_at, updated_at)
                SELECT p.id, f.name, f.color, f.position, gen_random_uuid(), now() AT TIME ZONE 'utc', now() AT TIME ZONE 'utc'
                FROM projects AS p
                CROSS JOIN (VALUES ('Baixa', 'blue', 0), ('Média', 'yellow', 1), ('Alta', 'orange', 2), ('Urgente', 'red', 3))
                    AS f(name, color, position);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Primeiro o que o modelo antigo nao sabe ler: um tipo de evento desconhecido
            // derruba a leitura do historico inteiro, e o titulo do relato, la, e nulo.
            migrationBuilder.Sql("""
                DELETE FROM events
                WHERE type IN ('card_title_changed', 'card_assignee_changed', 'card_priority_changed', 'card_labels_changed', 'card_due_date_changed');

                UPDATE reports SET title = NULL WHERE kind = 'report';
                """);

            migrationBuilder.DropForeignKey(
                name: "fk_reports_project_priorities_priority_id",
                table: "reports");

            migrationBuilder.DropForeignKey(
                name: "fk_reports_users_assignee_user_id",
                table: "reports");

            migrationBuilder.DropTable(
                name: "project_priorities");

            migrationBuilder.DropTable(
                name: "report_labels");

            migrationBuilder.DropTable(
                name: "project_labels");

            migrationBuilder.DropIndex(
                name: "ix_reports_assignee_user_id",
                table: "reports");

            migrationBuilder.DropIndex(
                name: "ix_reports_priority_id",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_team_fields",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "assignee_user_id",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "due_date",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "priority_id",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "reporter_title",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "report_title_mode",
                table: "project_widget_settings");

            migrationBuilder.AlterColumn<string>(
                name: "title",
                table: "reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true,
                comment: "Titulo do card do time. Nulo no relato.",
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldNullable: true,
                oldComment: "Titulo do time. Obrigatorio no card do time; no relato, o que o time reescreveu, nulo ate alguem reescrever. Interno: nenhuma rota publica o devolve.");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_team_fields",
                table: "reports",
                sql: "kind <> 'team' OR (title IS NOT NULL AND tracking_code IS NULL AND access_token_hash IS NULL AND reporter_code_id IS NULL AND project_public_stage_id IS NULL AND public_stage_due_at IS NULL AND moderation_state = 'pending' AND type IS NULL AND text IS NULL)");
        }
    }
}
