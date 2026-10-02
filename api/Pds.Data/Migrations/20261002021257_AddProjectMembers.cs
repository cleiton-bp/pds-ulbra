using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <summary>
    /// O time entra nos projetos: uma linha por pessoa em cada projeto, com o papel, e uma
    /// trava no banco para o papel so poder ser member ou administrator. Nada do que existe
    /// muda de forma — o dono de cada conta continua mandando nos projetos dela pelo
    /// users.account_id, sem linha nova, e por isso a migracao nao precisa copiar ninguem
    /// para a tabela nova. So os comentarios que diziam "a conta isola" mudam, porque quem
    /// decide o que a pessoa enxerga passou a ser o projeto.
    /// </summary>
    public partial class AddProjectMembers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterTable(
                name: "accounts",
                comment: "Conta: a dona dos dados. Todo projeto pertence a uma; o dono enxerga todos os projetos dela, e o time so os projetos em que entrou (project_members).",
                oldComment: "Conta: a fronteira de isolamento do sistema. Todo dado pertence a uma, e nenhuma consulta atravessa de uma para outra.");

            migrationBuilder.AlterColumn<long>(
                name: "account_id",
                table: "users",
                type: "bigint",
                nullable: false,
                comment: "Conta propria: nasce no primeiro acesso, e a pessoa e dona dela. Os projetos de outras contas chegam por project_members.",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldComment: "Conta a que este usuario pertence.");

            migrationBuilder.AlterColumn<long>(
                name: "report_id",
                table: "report_attachments",
                type: "bigint",
                nullable: false,
                comment: "Relato a que o anexo pertence. Obrigatorio mesmo quando o anexo veio numa resposta, para achar o relato ser sempre um salto so — e para o isolamento por projeto nao depender de uma coluna que pode ser nula.",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldComment: "Relato a que o anexo pertence. Obrigatorio mesmo quando o anexo veio numa resposta, para achar o relato ser sempre um salto so — e para o isolamento por conta nao depender de uma coluna que pode ser nula.");

            migrationBuilder.AlterColumn<long>(
                name: "account_id",
                table: "projects",
                type: "bigint",
                nullable: false,
                comment: "Conta dona do projeto. Quem e dono dela manda neste projeto sem linha em project_members; o resto do time chega por la.",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldComment: "Conta dona do projeto. E por este campo que o isolamento filtra.");

            migrationBuilder.CreateTable(
                name: "project_members",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, comment: "Chave interna, sequencial. Nunca sai da aplicacao.")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    project_id = table.Column<long>(type: "bigint", nullable: false, comment: "Projeto em que a pessoa entrou."),
                    user_id = table.Column<long>(type: "bigint", nullable: false, comment: "A pessoa. Pode ter conta propria e estar em projetos de outras contas."),
                    role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, comment: "member | administrator. Membro trabalha nos relatos e le a configuracao sem muda-la; administrador configura o projeto e decide quem entra."),
                    public_id = table.Column<Guid>(type: "uuid", nullable: false, comment: "Identificador publico, GUID aleatorio. E o que aparece em URL e API."),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Criacao do registro, em UTC."),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, comment: "Ultima alteracao, em UTC."),
                    deleted_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true, comment: "Nulo enquanto o registro vale; preenchido no lugar de apagar.")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_members", x => x.id);
                    table.CheckConstraint("ck_project_members_role", "role IN ('member', 'administrator')");
                    table.ForeignKey(
                        name: "fk_project_members_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_project_members_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                },
                comment: "Quem do time entrou em cada projeto, e com que papel. A entrada e por projeto, e nao pela conta: a mesma pessoa pode estar em projetos de varias contas. O dono da conta nao tem linha aqui — manda em todos os projetos dela pelo users.account_id.");

            migrationBuilder.CreateIndex(
                name: "ix_project_members_deleted_at",
                table: "project_members",
                column: "deleted_at");

            migrationBuilder.CreateIndex(
                name: "ix_project_members_user_id",
                table: "project_members",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ux_project_members_project_id_user_id",
                table: "project_members",
                columns: new[] { "project_id", "user_id" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_project_members_public_id",
                table: "project_members",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_members");

            migrationBuilder.AlterTable(
                name: "accounts",
                comment: "Conta: a fronteira de isolamento do sistema. Todo dado pertence a uma, e nenhuma consulta atravessa de uma para outra.",
                oldComment: "Conta: a dona dos dados. Todo projeto pertence a uma; o dono enxerga todos os projetos dela, e o time so os projetos em que entrou (project_members).");

            migrationBuilder.AlterColumn<long>(
                name: "account_id",
                table: "users",
                type: "bigint",
                nullable: false,
                comment: "Conta a que este usuario pertence.",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldComment: "Conta propria: nasce no primeiro acesso, e a pessoa e dona dela. Os projetos de outras contas chegam por project_members.");

            migrationBuilder.AlterColumn<long>(
                name: "report_id",
                table: "report_attachments",
                type: "bigint",
                nullable: false,
                comment: "Relato a que o anexo pertence. Obrigatorio mesmo quando o anexo veio numa resposta, para achar o relato ser sempre um salto so — e para o isolamento por conta nao depender de uma coluna que pode ser nula.",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldComment: "Relato a que o anexo pertence. Obrigatorio mesmo quando o anexo veio numa resposta, para achar o relato ser sempre um salto so — e para o isolamento por projeto nao depender de uma coluna que pode ser nula.");

            migrationBuilder.AlterColumn<long>(
                name: "account_id",
                table: "projects",
                type: "bigint",
                nullable: false,
                comment: "Conta dona do projeto. E por este campo que o isolamento filtra.",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldComment: "Conta dona do projeto. Quem e dono dela manda neste projeto sem linha em project_members; o resto do time chega por la.");
        }
    }
}
