using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionsRevokedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "sessions_revoked_at",
                table: "users",
                type: "timestamp without time zone",
                nullable: true,
                comment: "A partir de quando as sessoes valem, em UTC. 'Sair' grava aqui e invalida os tokens anteriores.");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "sessions_revoked_at",
                table: "users");
        }
    }
}
