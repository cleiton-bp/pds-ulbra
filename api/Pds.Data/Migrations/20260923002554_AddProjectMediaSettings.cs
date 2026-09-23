using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectMediaSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_media_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1."),
                    is_enabled = table.Column<bool>(type: "boolean", nullable: false, comment: "O quadro mostra anexo. Desligado, nada mais nesta linha vale — nem tipo ligado, nem limite configurado: o botao nao aparece e o servidor recusa assinar permissao. Sem armazenamento configurado nao liga, e a tela diz por que."),
                    allows_screen_capture = table.Column<bool>(type: "boolean", nullable: false, comment: "O botao de capturar a tela aparece. Nao e a captura automatica, que continua impossivel de dentro do quadro: aqui o navegador pergunta qual tela, e quem decide o que aparece e quem relata. Onde o navegador nao souber fazer, o botao some sozinho."),
                    allows_on_info_request = table.Column<bool>(type: "boolean", nullable: false, comment: "Da para anexar respondendo a um pedido de informacao do time, que e onde o print mais serve. Chave propria porque ha projeto que quer anexo na criacao e nao quer na conversa."),
                    max_files_per_report = table.Column<int>(type: "integer", nullable: false, comment: "Quantos arquivos cabem num relato, somando todos os tipos. Existe alem do limite por tipo, e nao no lugar dele: so com o limite por tipo, tres imagens mais um video passariam num projeto que so queria dois no total."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_media_settings", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_media_settings_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "O que este projeto aceita receber junto do relato. Uma linha por projeto, criada so quando alguem salva — os padroes vivem no codigo, e projeto sem linha e projeto que nunca precisou mudar nada. Nenhum limite de tipo mora aqui: isso fica em project_media_kinds, uma linha por tipo.");

            migrationBuilder.CreateTable(
                name: "project_media_kinds",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_media_settings_id = table.Column<long>(type: "bigint", nullable: false, comment: "Configuracao dona da linha. Pendura na configuracao, e nao no projeto, porque sem ela estes limites nao querem dizer nada."),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "image ou video. Unico por configuracao entre os nao apagados. A lista cresce com o produto, e acrescentar um valor nao mexe em coluna nenhuma."),
                    is_enabled = table.Column<bool>(type: "boolean", nullable: false, comment: "Este tipo e aceito. Desligar deixa os limites gravados, para religar nao obrigar a reconfigurar o que ja tinha sido pensado."),
                    max_count = table.Column<int>(type: "integer", nullable: false, comment: "Quantos arquivos deste tipo cabem num relato."),
                    max_bytes = table.Column<long>(type: "bigint", nullable: false, comment: "Teto de tamanho de cada arquivo, em bytes. E este numero que viaja dentro da assinatura do envio, e quem recusa o que passa e o proprio armazenamento — no quadro nao valeria, porque ele roda no navegador de quem relata, e no servidor tambem nao, porque o arquivo nunca passa por la."),
                    max_duration_seconds = table.Column<int>(type: "integer", nullable: true, comment: "Duracao maxima em segundos, nula para o que nao tem duracao. E a protecao mais barata desta etapa, porque corta armazenamento e exposicao de uma vez."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_media_kinds", x => x.id);
                    table.ForeignKey(
                        name: "fk_project_media_kinds_project_media_settings_id",
                        column: x => x.project_media_settings_id,
                        principalTable: "project_media_settings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Os limites de um tipo de midia, neste projeto. Uma linha por tipo, e e esse o ponto: acrescentar audio um dia e um INSERT, e nao uma migracao. Com uma coluna por tipo, cada tipo novo custaria migracao e toda linha carregaria campos de tipos que aquele projeto nunca ligou.");

            migrationBuilder.CreateIndex(
                name: "ix_project_media_kinds_deleted_at",
                table: "project_media_kinds",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_project_media_kinds_project_media_settings_id_kind",
                table: "project_media_kinds",
                columns: new[] { "project_media_settings_id", "kind" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_media_kinds_public_id",
                table: "project_media_kinds",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_project_media_settings_deleted_at",
                table: "project_media_settings",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_project_media_settings_project_id",
                table: "project_media_settings",
                column: "project_id",
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_media_settings_public_id",
                table: "project_media_settings",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_media_kinds");

            migrationBuilder.DropTable(
                name: "project_media_settings");
        }
    }
}
