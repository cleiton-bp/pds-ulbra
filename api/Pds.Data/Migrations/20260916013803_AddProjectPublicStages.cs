using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectPublicStages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_public_stages",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono da etapa. A jornada e de cada sistema, nao da conta."),
                    label = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false, comment: "O nome do passo, como quem relatou le. Unico no projeto: dois rotulos iguais na mesma linha do tempo nao teriam como ser distinguidos."),
                    description = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false, comment: "A frase que explica o passo. Obrigatoria: rotulo sozinho e o que a ferramenta de dentro ja dava."),
                    next_step = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true, comment: "O que vem depois, quando o cliente quer dizer. Nulo na ultima etapa, que nao tem depois."),
                    position = table.Column<int>(type: "integer", nullable: false, comment: "Ordem da jornada. Nao e unica: reordenar reescreve a lista inteira de uma vez."),
                    is_terminal = table.Column<bool>(type: "boolean", nullable: false, comment: "A etapa em que o trabalho do time acaba. Nao quer dizer encerrado: a confirmacao de quem relatou vem depois dela."),
                    allows_return = table.Column<bool>(type: "boolean", nullable: false, comment: "A jornada pode voltar para esta etapa. Por padrao ela nao anda para tras, e esta marca e a excecao combinada."),
                    awaits_reporter = table.Column<bool>(type: "boolean", nullable: false, comment: "A etapa espera quem relatou, e nao o time. Ainda nao e lida por ninguem: nasce com a tabela para nao custar migracao depois."),
                    outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true, comment: "done | wont_do | no_answer | duplicate. Nulo fora da etapa terminal, obrigatorio nela: fim sem desfecho e fim sem explicacao."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_public_stages", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_public_stages_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "A jornada que quem relatou acompanha. Separada de project_states porque o time precisa de detalhe que quem esta de fora nao precisa: varios estados caem numa etapa so, e essa perda de detalhe e o produto.");

            migrationBuilder.CreateIndex(
                name: "ix_project_public_stages_deleted_at",
                table: "project_public_stages",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_public_stages_project_id",
                table: "project_public_stages",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_public_stages_project_id_label",
                table: "project_public_stages",
                columns: new[] { "project_id", "label" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_public_stages_public_id",
                table: "project_public_stages",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_public_stages");
        }
    }
}
