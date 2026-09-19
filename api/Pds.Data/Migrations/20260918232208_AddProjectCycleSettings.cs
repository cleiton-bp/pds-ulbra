using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectCycleSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_cycle_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1."),
                    closure_trigger = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "last_column | button — se o relato encerra ao cair na ultima coluna ativa ou por um botao proprio."),
                    public_delay_minutes = table.Column<int>(type: "integer", nullable: false, comment: "Quanto o lado publico espera antes de mudar. Zero e o comportamento anterior a esta etapa; acima de zero e a janela para desfazer um movimento errado."),
                    allows_reopen = table.Column<bool>(type: "boolean", nullable: false, comment: "Se quem relatou pode reabrir."),
                    reopen_state_id = table.Column<long>(type: "bigint", nullable: true, comment: "Para qual coluna interna o relato volta ao ser reaberto. Nula usa a primeira ativa."),
                    reopen_requires_comment = table.Column<bool>(type: "boolean", nullable: false, comment: "Se reabrir exige dizer por que. O motivo e para quem vai pegar o relato de volta."),
                    tracking_code_can_act = table.Column<bool>(type: "boolean", nullable: false, comment: "Se o protocolo sozinho confirma e reabre, ou se as duas acoes exigem o link. Ler e inofensivo; reabrir mexe na fila do time."),
                    satisfaction_enabled = table.Column<bool>(type: "boolean", nullable: false, comment: "Se a nota e pedida ao confirmar."),
                    satisfaction_style = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "stars | number — como a escala de 1 a 5 aparece. Muda o desenho, e nao o dado: os dois guardam o mesmo inteiro."),
                    satisfaction_required = table.Column<bool>(type: "boolean", nullable: false, comment: "Se confirmar exige responder. Mesmo exigindo, 'prefiro nao responder' continua existindo, fora da escala."),
                    info_request_enabled = table.Column<bool>(type: "boolean", nullable: false, comment: "Se o time pode devolver o relato pedindo informacao em vez de encerrar."),
                    info_request_warn_days = table.Column<int>(type: "integer", nullable: false, comment: "Dias sem resposta ate avisar quem relatou de que o relato vai encerrar."),
                    info_request_close_days = table.Column<int>(type: "integer", nullable: false, comment: "Dias depois do aviso ate encerrar como sem retorno. Encerrado assim continua reabrivel."),
                    accepts_questions_default = table.Column<bool>(type: "boolean", nullable: false, comment: "Como a opcao de aceitar duvidas vem marcada no formulario. A escolha final e de quem relata, nao do projeto."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_cycle_settings", x => x.id);
                    table.CheckConstraint("ck_project_cycle_settings_info_request_days", "info_request_warn_days >= 1 AND info_request_warn_days <= 365 AND info_request_close_days >= 1 AND info_request_close_days <= 365");
                    table.CheckConstraint("ck_project_cycle_settings_public_delay", "public_delay_minutes >= 0 AND public_delay_minutes <= 10080");
                    table.ForeignKey(
                        name: "fk_project_cycle_settings_project_states_reopen_state_id",
                        column: x => x.reopen_state_id,
                        principalTable: "project_states",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_project_cycle_settings_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Como o ciclo fecha neste projeto: quando encerra, quanto espera antes de quem relatou ver, se da para reabrir e como, e o que a pessoa responde no fim. Uma linha por projeto, criada so quando alguem salva — os padroes vivem no codigo, e projeto sem linha e projeto que nunca precisou mudar nada.");

            migrationBuilder.CreateIndex(
                name: "ix_project_cycle_settings_deleted_at",
                table: "project_cycle_settings",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_cycle_settings_reopen_state_id",
                table: "project_cycle_settings",
                column: "reopen_state_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_cycle_settings_project_id",
                table: "project_cycle_settings",
                column: "project_id",
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_cycle_settings_public_id",
                table: "project_cycle_settings",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_cycle_settings");
        }
    }
}
