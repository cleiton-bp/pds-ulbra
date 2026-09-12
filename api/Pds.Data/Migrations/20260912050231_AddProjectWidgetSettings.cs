using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectWidgetSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_widget_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto a que esta configuracao pertence."),
                    is_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true, comment: "Desliga a ferramenta no site inteiro sem ninguem editar o HTML do cliente."),
                    accent_color = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true, comment: "Cor do gatilho em #rrggbb. Nulo quer dizer o acento do proprio produto, que acompanha o tema."),
                    position = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "bottom_right | bottom_left. De que canto inferior a ferramenta sai."),
                    theme = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "auto | light | dark. Auto segue o sistema de quem visita o site do cliente."),
                    launcher_label = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false, comment: "O texto dentro do gatilho, o botao que fica parado na pagina."),
                    title = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false, comment: "O titulo dentro do quadro. Nunca o nome do projeto, que e nome interno."),
                    placeholder = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false, comment: "O texto cinza da caixa vazia. E ele que faz a pergunta certa."),
                    success_message = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false, comment: "A frase acima do protocolo, na confirmacao."),
                    shows_type_field = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true, comment: "Mostra ou esconde o seletor de tipo no formulario."),
                    default_report_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "bug | improvement | question. Vem pre-marcado, e e o tipo gravado quando o seletor esta escondido."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_widget_settings", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_widget_settings_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Como a ferramenta de relato aparece no site de um projeto. Uma linha por projeto, criada so quando alguem salva: os padroes vivem no codigo, e projeto sem linha e projeto que nunca precisou mudar nada.");

            migrationBuilder.CreateIndex(
                name: "ix_project_widget_settings_deleted_at",
                table: "project_widget_settings",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_project_widget_settings_project_id",
                table: "project_widget_settings",
                column: "project_id",
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_widget_settings_public_id",
                table: "project_widget_settings",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_widget_settings");
        }
    }
}
