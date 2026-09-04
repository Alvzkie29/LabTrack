using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LabTrack.API.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionReview : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsReviewed",
                table: "AttendanceSessions",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ReviewNotes",
                table: "AttendanceSessions",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReviewOutcome",
                table: "AttendanceSessions",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReviewedAt",
                table: "AttendanceSessions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewedByUserId",
                table: "AttendanceSessions",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AttendanceSessions_ReviewedByUserId",
                table: "AttendanceSessions",
                column: "ReviewedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_AttendanceSessions_AspNetUsers_ReviewedByUserId",
                table: "AttendanceSessions",
                column: "ReviewedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AttendanceSessions_AspNetUsers_ReviewedByUserId",
                table: "AttendanceSessions");

            migrationBuilder.DropIndex(
                name: "IX_AttendanceSessions_ReviewedByUserId",
                table: "AttendanceSessions");

            migrationBuilder.DropColumn(
                name: "IsReviewed",
                table: "AttendanceSessions");

            migrationBuilder.DropColumn(
                name: "ReviewNotes",
                table: "AttendanceSessions");

            migrationBuilder.DropColumn(
                name: "ReviewOutcome",
                table: "AttendanceSessions");

            migrationBuilder.DropColumn(
                name: "ReviewedAt",
                table: "AttendanceSessions");

            migrationBuilder.DropColumn(
                name: "ReviewedByUserId",
                table: "AttendanceSessions");
        }
    }
}
