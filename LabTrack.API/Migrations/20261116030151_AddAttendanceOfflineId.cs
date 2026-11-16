using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LabTrack.API.Migrations
{
    /// <inheritdoc />
    public partial class AddAttendanceOfflineId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "OfflineId",
                table: "AttendanceSessions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AttendanceSessions_OfflineId",
                table: "AttendanceSessions",
                column: "OfflineId",
                unique: true,
                filter: "[OfflineId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AttendanceSessions_OfflineId",
                table: "AttendanceSessions");

            migrationBuilder.DropColumn(
                name: "OfflineId",
                table: "AttendanceSessions");
        }
    }
}
