using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportTypes : Migration
    {
        /// <summary>
        /// O texto da caixa que a configuracao da ferramenta tinha de fabrica. So o que o
        /// projeto mudou vai para os tipos; o de fabrica da lugar ao texto de cada tipo.
        /// </summary>
        private const string PlaceholderDeFabrica =
            "Descreva o que você viu, e onde. Se puder, diga o que esperava que acontecesse.";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_report_types",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono do tipo."),
                    name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false, comment: "Nome dado pelo time. Renomear nao reescreve o passado: o evento da entrada do relato guarda o nome que valia na epoca."),
                    color = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "gray | blue | green | yellow | orange | red | purple | pink. A paleta fixa das prioridades e etiquetas; a cor aparece so no painel."),
                    icon = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "bug | improvement | question | idea | praise | other. O desenho, de uma lista fixa: aparece no botao da ferramenta e no card."),
                    position = table.Column<int>(type: "integer", nullable: false, comment: "Ordem na tela e na ferramenta, escolhida pelo time."),
                    deactivated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o tipo e oferecido; preenchido para desativa-lo sem apagar, porque relato antigo continua apontando para ele. Ao menos um tipo fica ativo, e no maximo dez."),
                    questions = table.Column<List<string>>(type: "text[]", nullable: false, comment: "As perguntas curtas que o formulario faz, na ordem: de 0 a 4, cada uma ate 120 caracteres, sem repetir. Mudar nao reescreve os relatos, que guardam as perguntas do envio em reports.answers."),
                    shows_text_box = table.Column<bool>(type: "boolean", nullable: false, comment: "A caixa livre aparece no formulario. Sem perguntas, tem de aparecer."),
                    text_box_prompt = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true, comment: "O texto cinza dentro da caixa livre. Obrigatorio quando ela aparece; guardado com ela escondida, para voltar igual."),
                    initial_state_id = table.Column<long>(type: "bigint", nullable: true, comment: "A coluna em que o relato deste tipo entra. Nulo e o padrao: a primeira coluna ativa da fila. Do mesmo projeto, e ativa: aposentar a coluna que e entrada de algum tipo e recusado."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_report_types", x => x.id);
                    table.CheckConstraint("ck_project_report_types_asks_something", "shows_text_box OR cardinality(questions) > 0");
                    table.CheckConstraint("ck_project_report_types_questions", "cardinality(questions) <= 4");
                    table.CheckConstraint("ck_project_report_types_text_box_prompt", "NOT shows_text_box OR text_box_prompt IS NOT NULL");
                    table.ForeignKey(
                        name: "fk_project_report_types_project_states_initial_state_id",
                        column: x => x.initial_state_id,
                        principalTable: "project_states",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_project_report_types_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Os tipos de relato de cada projeto, com os nomes que o time deu. Nasce com tres de fabrica (Defeito, Melhoria, Duvida); o administrador renomeia, troca a cor e o desenho, reordena, cria outros ou desativa, como faz com as prioridades. Cada tipo diz como o formulario pergunta (perguntas curtas e/ou a caixa livre) e em que coluna o relato entra.");

            migrationBuilder.CreateIndex(
                name: "ix_project_report_types_deleted_at",
                table: "project_report_types",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_report_types_initial_state_id",
                table: "project_report_types",
                column: "initial_state_id");

            migrationBuilder.CreateIndex(
                name: "ix_project_report_types_project_id",
                table: "project_report_types",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_report_types_project_id_name",
                table: "project_report_types",
                columns: new[] { "project_id", "name" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_report_types_public_id",
                table: "project_report_types",
                column: "public_id",
                unique: true);

            migrationBuilder.AddColumn<long>(
                name: "report_type_id",
                table: "reports",
                type: "bigint",
                nullable: true,
                comment: "O tipo que a pessoa escolheu, um dos do projeto (project_report_types). Obrigatorio no relato, nulo no card do time. O nome da epoca fica no evento da entrada.");

            migrationBuilder.AddColumn<string>(
                name: "answers",
                table: "reports",
                type: "jsonb",
                nullable: true,
                comment: "As respostas, na ordem: [{question, answer}], com a pergunta copiada como estava no envio (mudar a pergunta depois nao reescreve o relato); a caixa livre no fim, com question nulo. A pergunta pulada nao entra. Nulo quando o tipo so tinha a caixa, e no card do time.");

            migrationBuilder.AlterColumn<string>(
                name: "text",
                table: "reports",
                type: "character varying(5000)",
                maxLength: 5000,
                nullable: true,
                comment: "O relato inteiro em texto. Com perguntas, as respostas que nao vieram em branco (e a caixa livre no fim) juntas, separadas por linha em branco e sem as perguntas: a busca, o titulo que sai do comeco do texto e a varredura leem daqui. Nulo no card do time, que tem titulo e descricao.",
                oldClrType: typeof(string),
                oldType: "character varying(5000)",
                oldMaxLength: 5000,
                oldNullable: true,
                oldComment: "O relato como a pessoa escreveu. Nulo no card do time, que tem titulo e descricao.");

            migrationBuilder.AddColumn<long>(
                name: "default_report_type_id",
                table: "project_widget_settings",
                type: "bigint",
                nullable: true,
                comment: "O tipo de relato que vem pre-marcado, e o gravado quando o seletor esta escondido. Nulo e o padrao: o primeiro tipo ativo do projeto. O escolhido que for desativado tambem cai no primeiro ativo, na leitura.");

            // Os tres tipos de fabrica para todo projeto que existe — os apagados
            // inclusive, porque os relatos deles continuam na tabela e o banco exige
            // tipo em todo relato. Os mesmos nomes, perguntas e textos de
            // ReportTypeDefaults, e o desenho de cada um e o valor antigo do enum: e
            // por ele que o resto desta migracao casa o antigo com o novo.
            //
            // Depois, nesta ordem: cada relato aponta para o seu (bug -> Defeito,
            // improvement -> Melhoria, question -> Duvida); a coluna de entrada que o
            // projeto escolheu por tipo passa para o tipo; o pre-marcado da ferramenta
            // vira o tipo correspondente; e o texto da caixa que o projeto tinha
            // mudado vai para os tipos que mostram a caixa — o de fabrica fica para
            // tras, porque cada tipo tem o seu.
            migrationBuilder.Sql($$"""
                INSERT INTO project_report_types (project_id, name, color, icon, position, questions, shows_text_box, text_box_prompt, public_id, created_at, updated_at)
                SELECT p.id, f.name, f.color, f.icon, f.position, f.questions, f.shows_text_box, f.text_box_prompt,
                       gen_random_uuid(), now() AT TIME ZONE 'utc', now() AT TIME ZONE 'utc'
                FROM projects AS p
                CROSS JOIN (VALUES
                    ('Defeito', 'red', 'bug', 0,
                        ARRAY['O que você tentou fazer?', 'O que aconteceu?', 'O que você esperava que acontecesse?']::text[],
                        false, NULL::character varying(160)),
                    ('Melhoria', 'green', 'improvement', 1, ARRAY[]::text[], true, 'O que você gostaria que mudasse, e por quê?'),
                    ('Dúvida', 'purple', 'question', 2, ARRAY[]::text[], true, 'Qual é a sua dúvida?'))
                    AS f(name, color, icon, position, questions, shows_text_box, text_box_prompt);

                UPDATE reports AS r
                SET report_type_id = t.id
                FROM project_report_types AS t
                WHERE r.type IS NOT NULL
                  AND t.project_id = r.project_id
                  AND t.icon = r.type;

                UPDATE project_report_types AS t
                SET initial_state_id = i.project_state_id
                FROM project_initial_states AS i
                WHERE i.deleted_at IS NULL
                  AND i.project_id = t.project_id
                  AND i.report_type = t.icon;

                UPDATE project_widget_settings AS w
                SET default_report_type_id = t.id
                FROM project_report_types AS t
                WHERE t.project_id = w.project_id
                  AND t.icon = w.default_report_type;

                UPDATE project_report_types AS t
                SET text_box_prompt = w.placeholder
                FROM project_widget_settings AS w
                WHERE w.deleted_at IS NULL
                  AND w.project_id = t.project_id
                  AND t.shows_text_box
                  AND btrim(w.placeholder) <> ''
                  AND w.placeholder <> '{{PlaceholderDeFabrica}}';
                """);

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_report_fields",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_team_fields",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "type",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "default_report_type",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "placeholder",
                table: "project_widget_settings");

            migrationBuilder.DropTable(
                name: "project_initial_states");

            migrationBuilder.CreateIndex(
                name: "ix_reports_report_type_id",
                table: "reports",
                column: "report_type_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_report_fields",
                table: "reports",
                sql: "kind <> 'report' OR (tracking_code IS NOT NULL AND access_token_hash IS NOT NULL AND report_type_id IS NOT NULL AND text IS NOT NULL AND description IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_team_fields",
                table: "reports",
                sql: "kind <> 'team' OR (title IS NOT NULL AND tracking_code IS NULL AND access_token_hash IS NULL AND reporter_code_id IS NULL AND project_public_stage_id IS NULL AND public_stage_due_at IS NULL AND moderation_state = 'pending' AND report_type_id IS NULL AND text IS NULL AND answers IS NULL AND reporter_title IS NULL)");

            migrationBuilder.CreateIndex(
                name: "ix_project_widget_settings_default_report_type_id",
                table: "project_widget_settings",
                column: "default_report_type_id");

            migrationBuilder.AddForeignKey(
                name: "fk_project_widget_settings_default_report_type_id",
                table: "project_widget_settings",
                column: "default_report_type_id",
                principalTable: "project_report_types",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_reports_project_report_types_report_type_id",
                table: "reports",
                column: "report_type_id",
                principalTable: "project_report_types",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_project_widget_settings_default_report_type_id",
                table: "project_widget_settings");

            migrationBuilder.DropForeignKey(
                name: "fk_reports_project_report_types_report_type_id",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_report_fields",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_team_fields",
                table: "reports");

            migrationBuilder.AddColumn<string>(
                name: "type",
                table: "reports",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true,
                comment: "bug | improvement | question. Lista fixa por enquanto. Nulo no card do time.");

            migrationBuilder.AddColumn<string>(
                name: "default_report_type",
                table: "project_widget_settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "bug",
                comment: "bug | improvement | question. Vem pre-marcado, e e o tipo gravado quando o seletor esta escondido.");

            migrationBuilder.AddColumn<string>(
                name: "placeholder",
                table: "project_widget_settings",
                type: "character varying(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: PlaceholderDeFabrica,
                comment: "O texto cinza da caixa vazia. E ele que faz a pergunta certa.");

            migrationBuilder.CreateTable(
                name: "project_initial_states",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto a que esta escolha pertence."),
                    project_state_id = table.Column<long>(type: "bigint", nullable: false, comment: "Estado onde o relato deste tipo cai. Do mesmo projeto, e ativo."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    report_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "bug, improvement ou question. Unico por projeto entre os nao apagados."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_initial_states", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_initial_states_project_states_project_state_id",
                        column: x => x.project_state_id,
                        principalTable: "project_states",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_project_initial_states_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Onde um relato cai ao entrar, por tipo. E tabela em vez de colunas em projects para tipo novo nao pedir migracao, e a linha so nasce quando o cliente escolhe: sem linha, vale o primeiro estado ativo da fila.");

            // A volta ao enum fixo. Cada tipo vira um dos tres valores antigos: pelo
            // desenho, quando e um dos tres de sempre; senao pelo nome de fabrica; e o
            // que sobra (um tipo criado depois, com outro desenho) vira bug, que era o
            // padrao. As perguntas e as respostas nao tem para onde voltar — o texto
            // do relato ja e o relato inteiro, e fica.
            //
            // O pre-marcado volta como o escolhido, se ainda ativo, senao o primeiro
            // ativo — a mesma leitura de hoje. O texto da caixa volta como o primeiro
            // texto de tipo que nao e de fabrica, senao o de fabrica antigo. E a coluna
            // de entrada volta uma por valor antigo, do tipo ativo mais acima.
            migrationBuilder.Sql($$"""
                ALTER TABLE project_report_types ADD COLUMN legacy_type character varying(20);

                UPDATE project_report_types
                SET legacy_type = CASE
                    WHEN icon IN ('bug', 'improvement', 'question') THEN icon
                    WHEN name = 'Defeito' THEN 'bug'
                    WHEN name = 'Melhoria' THEN 'improvement'
                    WHEN name = 'Dúvida' THEN 'question'
                    ELSE 'bug'
                END;

                UPDATE reports AS r
                SET type = t.legacy_type
                FROM project_report_types AS t
                WHERE t.id = r.report_type_id;

                UPDATE project_widget_settings AS w
                SET default_report_type = COALESCE(
                    (SELECT t.legacy_type
                     FROM project_report_types AS t
                     WHERE t.project_id = w.project_id
                       AND t.deleted_at IS NULL
                       AND t.deactivated_at IS NULL
                     ORDER BY COALESCE(t.id = w.default_report_type_id, false) DESC, t.position, t.id
                     LIMIT 1),
                    'bug');

                UPDATE project_widget_settings AS w
                SET placeholder = COALESCE(
                    (SELECT t.text_box_prompt
                     FROM project_report_types AS t
                     WHERE t.project_id = w.project_id
                       AND t.deleted_at IS NULL
                       AND t.shows_text_box
                       AND t.text_box_prompt IS NOT NULL
                       AND t.text_box_prompt NOT IN ('O que você gostaria que mudasse, e por quê?', 'Qual é a sua dúvida?')
                     ORDER BY t.position, t.id
                     LIMIT 1),
                    '{{PlaceholderDeFabrica}}');

                INSERT INTO project_initial_states (project_id, report_type, project_state_id, public_id, created_at, updated_at)
                SELECT DISTINCT ON (t.project_id, t.legacy_type)
                       t.project_id, t.legacy_type, t.initial_state_id,
                       gen_random_uuid(), now() AT TIME ZONE 'utc', now() AT TIME ZONE 'utc'
                FROM project_report_types AS t
                WHERE t.initial_state_id IS NOT NULL
                  AND t.deleted_at IS NULL
                ORDER BY t.project_id, t.legacy_type, (t.deactivated_at IS NOT NULL), t.position, t.id;

                ALTER TABLE project_widget_settings ALTER COLUMN default_report_type DROP DEFAULT;
                ALTER TABLE project_widget_settings ALTER COLUMN placeholder DROP DEFAULT;
                """);

            migrationBuilder.DropIndex(
                name: "ix_reports_report_type_id",
                table: "reports");

            migrationBuilder.DropIndex(
                name: "ix_project_widget_settings_default_report_type_id",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "answers",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "report_type_id",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "default_report_type_id",
                table: "project_widget_settings");

            migrationBuilder.AlterColumn<string>(
                name: "text",
                table: "reports",
                type: "character varying(5000)",
                maxLength: 5000,
                nullable: true,
                comment: "O relato como a pessoa escreveu. Nulo no card do time, que tem titulo e descricao.",
                oldClrType: typeof(string),
                oldType: "character varying(5000)",
                oldMaxLength: 5000,
                oldNullable: true,
                oldComment: "O relato inteiro em texto. Com perguntas, as respostas que nao vieram em branco (e a caixa livre no fim) juntas, separadas por linha em branco e sem as perguntas: a busca, o titulo que sai do comeco do texto e a varredura leem daqui. Nulo no card do time, que tem titulo e descricao.");

            migrationBuilder.DropTable(
                name: "project_report_types");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_report_fields",
                table: "reports",
                sql: "kind <> 'report' OR (tracking_code IS NOT NULL AND access_token_hash IS NOT NULL AND type IS NOT NULL AND text IS NOT NULL AND description IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_team_fields",
                table: "reports",
                sql: "kind <> 'team' OR (title IS NOT NULL AND tracking_code IS NULL AND access_token_hash IS NULL AND reporter_code_id IS NULL AND project_public_stage_id IS NULL AND public_stage_due_at IS NULL AND moderation_state = 'pending' AND type IS NULL AND text IS NULL AND reporter_title IS NULL)");

            migrationBuilder.CreateIndex(
                name: "ix_project_initial_states_deleted_at",
                table: "project_initial_states",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_initial_states_project_state_id",
                table: "project_initial_states",
                column: "project_state_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_initial_states_project_id_report_type",
                table: "project_initial_states",
                columns: new[] { "project_id", "report_type" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_initial_states_public_id",
                table: "project_initial_states",
                column: "public_id",
                unique: true);
        }
    }
}
