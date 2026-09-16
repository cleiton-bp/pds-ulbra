using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEventUser : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "user_id",
                table: "events",
                type: "bigint",
                nullable: true,
                comment: "Quem do time fez. Nulo quando a acao veio de fora, e nos eventos anteriores a esta coluna.");

            migrationBuilder.CreateIndex(
                name: "ix_events_user_id",
                table: "events",
                column: "user_id");

            migrationBuilder.AddForeignKey(
                name: "fk_events_users_user_id",
                table: "events",
                column: "user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_events_users_user_id",
                table: "events");

            migrationBuilder.DropIndex(
                name: "ix_events_user_id",
                table: "events");

            migrationBuilder.DropColumn(
                name: "user_id",
                table: "events");
        }
    }
}
