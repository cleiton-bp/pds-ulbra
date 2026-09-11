using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportsAndEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "reports",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    account_id = table.Column<long>(type: "bigint", nullable: false, comment: "Conta dona do relato, repetido de proposito em vez de chegar pelo projeto."),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto de onde o relato veio, resolvido pela chave publica da requisicao."),
                    tracking_code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "O protocolo que a pessoa le e repete. Alfabeto sem 0, O, 1 e I; colisao tratada na geracao."),
                    access_token_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false, comment: "Hash do token do link de acompanhamento. O valor original so existe na URL entregue."),
                    type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "bug | improvement | question. Lista fixa por enquanto."),
                    text = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: false, comment: "O relato como a pessoa escreveu."),
                    route = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true, comment: "So o caminho da pagina, sem query e sem fragmento: e na query que viaja dado sensivel."),
                    origin = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: true, comment: "Dominio informado pela pagina que embutiu a ferramenta. Indicio, nunca prova."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reports", x => x.id);
                    table.ForeignKey(
                        name: "fk_reports_accounts_account_id",
                        column: x => x.account_id,
                        principalTable: "accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_reports_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "O que a pessoa de fora escreveu. Primeira tabela do sistema que nasce sem conta e sem sessao, e por isso carrega o proprio account_id, o protocolo que a pessoa le e o hash do token que abre o acompanhamento.");

            migrationBuilder.CreateTable(
                name: "events",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio."),
                    account_id = table.Column<long>(type: "bigint", nullable: true, comment: "Conta de origem. Continua apontando para ela depois de anonimizada."),
                    project_id = table.Column<long>(type: "bigint", nullable: true, comment: "Projeto de origem. Anulavel porque o projeto some de verdade e o evento fica."),
                    report_id = table.Column<long>(type: "bigint", nullable: true, comment: "Relato a que o evento se refere. Nulo quando o evento nao nasce de um relato."),
                    type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false, comment: "report_created | report_viewed por enquanto. A lista cresce conforme o produto anda."),
                    source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "widget | panel | api | public_page. De onde a acao partiu."),
                    payload = table.Column<string>(type: "jsonb", nullable: true, comment: "O resto do evento em chave e valor, para tipo novo entrar sem migracao."),
                    occurred_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Quando aconteceu, em UTC. E esta a data que a analise usa."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Quando a linha foi gravada, em UTC. Difere de occurred_at quando houve retentativa.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_events", x => x.id);
                    table.ForeignKey(
                        name: "fk_events_accounts_account_id",
                        column: x => x.account_id,
                        principalTable: "accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_events_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_events_reports_report_id",
                        column: x => x.report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                },
                comment: "O registro do que aconteceu, e a tabela que responde a pergunta de pesquisa. Unica do sistema que so cresce: nunca e alterada e nunca e apagada, nem quando a conta que a originou e excluida.");

            migrationBuilder.CreateTable(
                name: "report_contexts",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    report_id = table.Column<long>(type: "bigint", nullable: false, comment: "Relato a que este dado pertence."),
                    key = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false, comment: "Nome do dado em ingles e snake_case, como user_agent ou viewport_width."),
                    value = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true, comment: "O valor como chegou, sempre texto. A interpretacao fica com quem le."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_report_contexts", x => x.id);
                    table.ForeignKey(
                        name: "fk_report_contexts_reports_report_id",
                        column: x => x.report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "O que veio junto com o relato sem ninguem digitar. Tabela separada em vez de colunas em reports porque o que se vai querer saber amanha ainda nao esta decidido hoje.");

            migrationBuilder.CreateIndex(
                name: "ix_events_account_id_occurred_at",
                table: "events",
                columns: new[] { "account_id", "occurred_at" });

            migrationBuilder.CreateIndex(
                name: "ix_events_project_id_occurred_at",
                table: "events",
                columns: new[] { "project_id", "occurred_at" });

            migrationBuilder.CreateIndex(
                name: "ix_events_report_id",
                table: "events",
                column: "report_id");

            migrationBuilder.CreateIndex(
                name: "ux_events_public_id",
                table: "events",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_report_contexts_deleted_at",
                table: "report_contexts",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_report_contexts_public_id",
                table: "report_contexts",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_report_contexts_report_id_key",
                table: "report_contexts",
                columns: new[] { "report_id", "key" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_reports_access_token_hash",
                table: "reports",
                column: "access_token_hash");

            migrationBuilder.CreateIndex(
                name: "ix_reports_account_id_created_at",
                table: "reports",
                columns: new[] { "account_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_reports_deleted_at",
                table: "reports",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_reports_project_id_created_at",
                table: "reports",
                columns: new[] { "project_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ux_reports_public_id",
                table: "reports",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_reports_tracking_code",
                table: "reports",
                column: "tracking_code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "events");

            migrationBuilder.DropTable(
                name: "report_contexts");

            migrationBuilder.DropTable(
                name: "reports");
        }
    }
}
