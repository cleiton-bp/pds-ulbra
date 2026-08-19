using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "accounts",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false, comment: "Nome da conta, exibido no painel."),
                    purge_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Data em que a exclusao vira definitiva. Gravada no pedido para sobreviver a mudanca de politica."),
                    anonymized_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Quando a identificacao foi removida. A partir daqui nenhuma linha da conta guarda dado pessoal."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_accounts", x => x.id);
                },
                comment: "Conta: a fronteira de isolamento do sistema. Todo dado pertence a uma, e nenhuma consulta atravessa de uma para outra.");

            migrationBuilder.CreateTable(
                name: "projects",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    account_id = table.Column<long>(type: "bigint", nullable: false, comment: "Conta dona do projeto. E por este campo que o isolamento filtra."),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false, comment: "Nome do projeto, unico dentro da conta entre os que nao foram apagados."),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "active | archived. Arquivado continua visivel, so para de aceitar coisa nova."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_projects", x => x.id);
                    table.ForeignKey(
                        name: "fk_projects_accounts_account_id",
                        column: x => x.account_id,
                        principalTable: "accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Projeto: a unidade que o cliente configura e a que identifica de onde veio cada relato.");

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    account_id = table.Column<long>(type: "bigint", nullable: false, comment: "Conta a que este usuario pertence."),
                    google_subject = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false, comment: "O sub do Google. Identificador estavel: e por ele que o login reconhece a pessoa."),
                    email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true, comment: "E-mail vindo do Google. Pode mudar la, entao serve para contato e nao como identidade."),
                    name = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: true, comment: "Nome vindo do Google."),
                    avatar_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true, comment: "Foto vinda do Google. Opcional."),
                    last_login_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Ultimo acesso, em UTC."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                    table.ForeignKey(
                        name: "fk_users_accounts_account_id",
                        column: x => x.account_id,
                        principalTable: "accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Quem entra no painel. A identidade vem do Google, entao nao ha senha nem recuperacao.");

            migrationBuilder.CreateTable(
                name: "project_keys",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto dono da chave."),
                    type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "public | secret. Define se o valor e guardado em claro ou como hash."),
                    value = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true, comment: "So para a publica: vai aparecer no site do cliente, entao fica em claro."),
                    hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true, comment: "So para a secreta: o valor original nunca e guardado."),
                    prefix = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false, comment: "Primeiros caracteres, para identificar a chave na lista sem revela-la."),
                    revoked_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto valida; preenchido ao regenerar, em UTC. Nao confundir com deleted_at."),
                    last_used_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Ultimo uso, em UTC. Ajuda a saber se da para revogar sem quebrar nada."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_keys", x => x.id);
                    table.CheckConstraint("ck_project_keys_value_xor_hash", "(type = 'public' AND value IS NOT NULL AND hash IS NULL) OR (type = 'secret' AND value IS NULL AND hash IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_project_keys_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                },
                comment: "Chave que liga o sistema do cliente ao nosso. Tabela separada de projects porque chave e rotacionada e revogada, e guardar quando cada uma valeu e o que permite investigar um incidente depois.");

            migrationBuilder.CreateIndex(
                name: "ix_accounts_deleted_at",
                table: "accounts",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_accounts_public_id",
                table: "accounts",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_project_keys_deleted_at",
                table: "project_keys",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_keys_hash",
                table: "project_keys",
                column: "hash");

            migrationBuilder.CreateIndex(
                name: "ix_project_keys_project_id_type",
                table: "project_keys",
                columns: new[] { "project_id", "type" });

            migrationBuilder.CreateIndex(
                name: "ix_project_keys_value",
                table: "project_keys",
                column: "value");

            migrationBuilder.CreateIndex(
                name: "ux_project_keys_public_id",
                table: "project_keys",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_projects_deleted_at",
                table: "projects",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_projects_account_id_name",
                table: "projects",
                columns: new[] { "account_id", "name" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_projects_public_id",
                table: "projects",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_users_account_id",
                table: "users",
                column: "account_id");

            migrationBuilder.CreateIndex(
                name: "ix_users_deleted_at",
                table: "users",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ux_users_google_subject",
                table: "users",
                column: "google_subject",
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_users_public_id",
                table: "users",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_keys");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropTable(
                name: "projects");

            migrationBuilder.DropTable(
                name: "accounts");
        }
    }
}
