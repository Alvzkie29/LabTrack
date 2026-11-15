using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LabTrack.API.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditLogTimestampIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_Timestamp",
                table: "AuditLogs",
                column: "Timestamp",
                descending: new bool[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AuditLogs_Timestamp",
                table: "AuditLogs");
        }
    }
}
