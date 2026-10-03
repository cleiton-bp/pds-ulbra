using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <summary>
    /// O card do time entra na tabela do relato, e todo card ganha numero.
    ///
    /// <para><b>Os relatos que ja existem sao numerados aqui</b>, por projeto, na
    /// ordem em que chegaram — os apagados tambem: o numero foi dado, e nao volta
    /// para a fila. O contador de cada projeto parte do maior numero dele.</para>
    ///
    /// <para><b>A volta apaga os cards do time</b>, com os comentarios internos
    /// deles: no modelo antigo todo card e relato, com protocolo e texto, e o card do
    /// time nao tem onde ficar. Os eventos ficam, sem o card, como fica todo evento de
    /// algo que saiu.</para>
    /// </summary>
    public partial class AddTeamCards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterTable(
                name: "reports",
                comment: "Os cards do trabalho do time: o relato que a pessoa de fora escreveu (kind = report) e o card que o time criou no painel (kind = team). O relato e a primeira tabela do sistema que nasce sem conta e sem sessao, e por isso carrega o proprio account_id, o protocolo que a pessoa le e o hash do token que abre o acompanhamento; o card do time nao tem lado de fora nenhum.",
                oldComment: "O que a pessoa de fora escreveu. Primeira tabela do sistema que nasce sem conta e sem sessao, e por isso carrega o proprio account_id, o protocolo que a pessoa le e o hash do token que abre o acompanhamento.");

            migrationBuilder.AlterColumn<string>(
                name: "type",
                table: "reports",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true,
                comment: "bug | improvement | question. Lista fixa por enquanto. Nulo no card do time.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "bug | improvement | question. Lista fixa por enquanto.");

            migrationBuilder.AlterColumn<string>(
                name: "tracking_code",
                table: "reports",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true,
                comment: "O protocolo que a pessoa le e repete. Alfabeto sem 0, O, 1 e I; colisao tratada na geracao. Nulo no card do time, que nao tem lado de fora.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "O protocolo que a pessoa le e repete. Alfabeto sem 0, O, 1 e I; colisao tratada na geracao.");

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
                oldComment: "O relato como a pessoa escreveu.");

            migrationBuilder.AlterColumn<string>(
                name: "access_token_hash",
                table: "reports",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true,
                comment: "Hash do token do link de acompanhamento. O valor original so existe na URL entregue. Nulo no card do time.",
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128,
                oldComment: "Hash do token do link de acompanhamento. O valor original so existe na URL entregue.");

            migrationBuilder.AddColumn<DateTime>(
                name: "archived_at",
                table: "reports",
                type: "timestamp without time zone",
                nullable: true,
                comment: "Quando o card saiu da tela de Trabalho. Nulo enquanto esta nela. Arquivado se le e se comenta; mover e editar pedem desarquivar.");

            migrationBuilder.AddColumn<long>(
                name: "created_by_user_id",
                table: "reports",
                type: "bigint",
                nullable: true,
                comment: "Quem do time criou o card. Nulo no relato: quem escreveu nao tem usuario aqui.");

            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "reports",
                type: "character varying(10000)",
                maxLength: 10000,
                nullable: true,
                comment: "Descricao do card do time, em Markdown; o painel a desenha sem HTML. Sempre nula no relato, cujo texto e de quem relatou.");

            migrationBuilder.AddColumn<string>(
                name: "kind",
                table: "reports",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "report",
                comment: "report | team. O relato veio de fora, pela ferramenta; o card do time nasceu no painel e nunca tem lado de fora.");

            migrationBuilder.AddColumn<int>(
                name: "number",
                table: "reports",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                comment: "O numero curto do card no projeto (#42). Interno: nenhuma rota publica o devolve. Vem de projects.last_card_number; pode pular, nunca repete.");

            migrationBuilder.AddColumn<string>(
                name: "title",
                table: "reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true,
                comment: "Titulo do card do time. Nulo no relato.");

            migrationBuilder.AddColumn<int>(
                name: "last_card_number",
                table: "projects",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                comment: "O ultimo numero de card dado no projeto; o proximo leva este mais um. Somado numa gravacao so (UPDATE ... RETURNING), que serializa quem cria ao mesmo tempo. Nao e o maior reports.number: lido assim, dois cards simultaneos tentariam o mesmo numero.");

            migrationBuilder.AddColumn<bool>(
                name: "allows_report_archiving",
                table: "project_cycle_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                comment: "O time pode arquivar relato. Desligado de fabrica. Ligado, arquivar um relato aberto encerra junto, com desfecho e motivo: quem relatou le o motivo e pode reabrir ou finalizar.");

            // Antes do indice unico e da trava do numero: ate aqui todo relato tem
            // numero zero. O padrao das duas colunas novas so serviu para as linhas
            // que ja existiam — daqui em diante quem grava diz o tipo e o numero.
            migrationBuilder.Sql("""
                UPDATE reports AS r
                SET number = numerados.numero
                FROM (
                    SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS numero
                    FROM reports
                ) AS numerados
                WHERE r.id = numerados.id;

                UPDATE projects AS p
                SET last_card_number = maiores.maior
                FROM (SELECT project_id, max(number) AS maior FROM reports GROUP BY project_id) AS maiores
                WHERE p.id = maiores.project_id;

                ALTER TABLE reports ALTER COLUMN kind DROP DEFAULT;
                ALTER TABLE reports ALTER COLUMN number DROP DEFAULT;
                """);

            migrationBuilder.CreateIndex(
                name: "ix_reports_created_by_user_id",
                table: "reports",
                column: "created_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ux_reports_project_id_number",
                table: "reports",
                columns: new[] { "project_id", "number" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_kind",
                table: "reports",
                sql: "kind IN ('report', 'team')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_number",
                table: "reports",
                sql: "number > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_report_fields",
                table: "reports",
                sql: "kind <> 'report' OR (tracking_code IS NOT NULL AND access_token_hash IS NOT NULL AND type IS NOT NULL AND text IS NOT NULL AND description IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_reports_team_fields",
                table: "reports",
                sql: "kind <> 'team' OR (title IS NOT NULL AND tracking_code IS NULL AND access_token_hash IS NULL AND reporter_code_id IS NULL AND project_public_stage_id IS NULL AND public_stage_due_at IS NULL AND moderation_state = 'pending' AND type IS NULL AND text IS NULL)");

            migrationBuilder.AddForeignKey(
                name: "fk_reports_users_created_by_user_id",
                table: "reports",
                column: "created_by_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Primeiro, enquanto a coluna kind existe: o card do time nao cabe no
            // modelo antigo, em que protocolo e texto sao obrigatorios. Os eventos
            // saem antes dele, e com eles os quatro tipos que o modelo antigo nao
            // conhece — tambem os do relato arquivado: um tipo desconhecido derruba
            // a leitura do historico inteiro. Os do card do time sairiam sem dono, e
            // seriam contados como se fossem de um relato.
            migrationBuilder.Sql("""
                DELETE FROM events
                WHERE type IN ('team_card_created', 'team_card_edited', 'card_archived', 'card_unarchived')
                   OR report_id IN (SELECT id FROM reports WHERE kind = 'team');

                DELETE FROM report_internal_comments
                WHERE report_id IN (SELECT id FROM reports WHERE kind = 'team');

                DELETE FROM reports WHERE kind = 'team';
                """);

            migrationBuilder.DropForeignKey(
                name: "fk_reports_users_created_by_user_id",
                table: "reports");

            migrationBuilder.DropIndex(
                name: "ix_reports_created_by_user_id",
                table: "reports");

            migrationBuilder.DropIndex(
                name: "ux_reports_project_id_number",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_kind",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_number",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_report_fields",
                table: "reports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_reports_team_fields",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "archived_at",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "created_by_user_id",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "description",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "kind",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "number",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "title",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "last_card_number",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "allows_report_archiving",
                table: "project_cycle_settings");

            migrationBuilder.AlterTable(
                name: "reports",
                comment: "O que a pessoa de fora escreveu. Primeira tabela do sistema que nasce sem conta e sem sessao, e por isso carrega o proprio account_id, o protocolo que a pessoa le e o hash do token que abre o acompanhamento.",
                oldComment: "Os cards do trabalho do time: o relato que a pessoa de fora escreveu (kind = report) e o card que o time criou no painel (kind = team). O relato e a primeira tabela do sistema que nasce sem conta e sem sessao, e por isso carrega o proprio account_id, o protocolo que a pessoa le e o hash do token que abre o acompanhamento; o card do time nao tem lado de fora nenhum.");

            migrationBuilder.AlterColumn<string>(
                name: "type",
                table: "reports",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "bug | improvement | question. Lista fixa por enquanto.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldNullable: true,
                oldComment: "bug | improvement | question. Lista fixa por enquanto. Nulo no card do time.");

            migrationBuilder.AlterColumn<string>(
                name: "tracking_code",
                table: "reports",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "O protocolo que a pessoa le e repete. Alfabeto sem 0, O, 1 e I; colisao tratada na geracao.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldNullable: true,
                oldComment: "O protocolo que a pessoa le e repete. Alfabeto sem 0, O, 1 e I; colisao tratada na geracao. Nulo no card do time, que nao tem lado de fora.");

            migrationBuilder.AlterColumn<string>(
                name: "text",
                table: "reports",
                type: "character varying(5000)",
                maxLength: 5000,
                nullable: false,
                comment: "O relato como a pessoa escreveu.",
                oldClrType: typeof(string),
                oldType: "character varying(5000)",
                oldMaxLength: 5000,
                oldNullable: true,
                oldComment: "O relato como a pessoa escreveu. Nulo no card do time, que tem titulo e descricao.");

            migrationBuilder.AlterColumn<string>(
                name: "access_token_hash",
                table: "reports",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                comment: "Hash do token do link de acompanhamento. O valor original so existe na URL entregue.",
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128,
                oldNullable: true,
                oldComment: "Hash do token do link de acompanhamento. O valor original so existe na URL entregue. Nulo no card do time.");
        }
    }
}
