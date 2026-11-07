using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LabTrack.API.Migrations
{
    /// <inheritdoc />
    public partial class AlignWithNewDesign : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AttendanceSessions_AspNetUsers_ReviewedByUserId",
                table: "AttendanceSessions");

            migrationBuilder.DropForeignKey(
                name: "FK_SessionConfirmations_AspNetUsers_ConfirmedBy",
                table: "SessionConfirmations");

            migrationBuilder.DropTable(
                name: "ActivityScores");

            migrationBuilder.DropIndex(
                name: "IX_SessionConfirmations_ConfirmedBy",
                table: "SessionConfirmations");

            migrationBuilder.DropIndex(
                name: "IX_AttendanceSessions_ReviewedByUserId",
                table: "AttendanceSessions");

            migrationBuilder.DropColumn(
                name: "LastHeartbeat",
                table: "Workstations");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Workstations");

            migrationBuilder.DropColumn(
                name: "ConfirmedBy",
                table: "SessionConfirmations");

            migrationBuilder.DropColumn(
                name: "InstructorName",
                table: "CourseSections");

            migrationBuilder.DropColumn(
                name: "IsReviewed",
                table: "AttendanceSessions");

            migrationBuilder.DropColumn(
                name: "LogoutTime",
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

            migrationBuilder.RenameColumn(
                name: "DeviceIdentifier",
                table: "Workstations",
                newName: "PcIdentifier");

            migrationBuilder.RenameIndex(
                name: "IX_Workstations_DeviceIdentifier",
                table: "Workstations",
                newName: "IX_Workstations_PcIdentifier");

            migrationBuilder.RenameColumn(
                name: "ReviewNotes",
                table: "AttendanceSessions",
                newName: "Notes");

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Workstations",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "FacultyConfirmedAt",
                table: "SessionConfirmations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FacultyConfirmedBy",
                table: "SessionConfirmations",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "FinalConfirmedAt",
                table: "SessionConfirmations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FinalConfirmedBy",
                table: "SessionConfirmations",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SessionType",
                table: "SessionConfirmations",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Physical");

            migrationBuilder.AddColumn<string>(
                name: "DayOfWeek",
                table: "CourseSections",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<TimeOnly>(
                name: "EndTime",
                table: "CourseSections",
                type: "time",
                nullable: false,
                defaultValue: new TimeOnly(0, 0, 0));

            migrationBuilder.AddColumn<string>(
                name: "FacultyId",
                table: "CourseSections",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LabId",
                table: "CourseSections",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "StartTime",
                table: "CourseSections",
                type: "time",
                nullable: false,
                defaultValue: new TimeOnly(0, 0, 0));

            migrationBuilder.AddColumn<string>(
                name: "PinHash",
                table: "AspNetUsers",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SessionConfirmations_FacultyConfirmedBy",
                table: "SessionConfirmations",
                column: "FacultyConfirmedBy");

            migrationBuilder.CreateIndex(
                name: "IX_SessionConfirmations_FinalConfirmedBy",
                table: "SessionConfirmations",
                column: "FinalConfirmedBy");

            migrationBuilder.CreateIndex(
                name: "IX_CourseSections_FacultyId",
                table: "CourseSections",
                column: "FacultyId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseSections_LabId_DayOfWeek",
                table: "CourseSections",
                columns: new[] { "LabId", "DayOfWeek" });

            migrationBuilder.AddForeignKey(
                name: "FK_CourseSections_AspNetUsers_FacultyId",
                table: "CourseSections",
                column: "FacultyId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_CourseSections_Laboratories_LabId",
                table: "CourseSections",
                column: "LabId",
                principalTable: "Laboratories",
                principalColumn: "LabId",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SessionConfirmations_AspNetUsers_FacultyConfirmedBy",
                table: "SessionConfirmations",
                column: "FacultyConfirmedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SessionConfirmations_AspNetUsers_FinalConfirmedBy",
                table: "SessionConfirmations",
                column: "FinalConfirmedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CourseSections_AspNetUsers_FacultyId",
                table: "CourseSections");

            migrationBuilder.DropForeignKey(
                name: "FK_CourseSections_Laboratories_LabId",
                table: "CourseSections");

            migrationBuilder.DropForeignKey(
                name: "FK_SessionConfirmations_AspNetUsers_FacultyConfirmedBy",
                table: "SessionConfirmations");

            migrationBuilder.DropForeignKey(
                name: "FK_SessionConfirmations_AspNetUsers_FinalConfirmedBy",
                table: "SessionConfirmations");

            migrationBuilder.DropIndex(
                name: "IX_SessionConfirmations_FacultyConfirmedBy",
                table: "SessionConfirmations");

            migrationBuilder.DropIndex(
                name: "IX_SessionConfirmations_FinalConfirmedBy",
                table: "SessionConfirmations");

            migrationBuilder.DropIndex(
                name: "IX_CourseSections_FacultyId",
                table: "CourseSections");

            migrationBuilder.DropIndex(
                name: "IX_CourseSections_LabId_DayOfWeek",
                table: "CourseSections");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Workstations");

            migrationBuilder.DropColumn(
                name: "FacultyConfirmedAt",
                table: "SessionConfirmations");

            migrationBuilder.DropColumn(
                name: "FacultyConfirmedBy",
                table: "SessionConfirmations");

            migrationBuilder.DropColumn(
                name: "FinalConfirmedAt",
                table: "SessionConfirmations");

            migrationBuilder.DropColumn(
                name: "FinalConfirmedBy",
                table: "SessionConfirmations");

            migrationBuilder.DropColumn(
                name: "SessionType",
                table: "SessionConfirmations");

            migrationBuilder.DropColumn(
                name: "DayOfWeek",
                table: "CourseSections");

            migrationBuilder.DropColumn(
                name: "EndTime",
                table: "CourseSections");

            migrationBuilder.DropColumn(
                name: "FacultyId",
                table: "CourseSections");

            migrationBuilder.DropColumn(
                name: "LabId",
                table: "CourseSections");

            migrationBuilder.DropColumn(
                name: "StartTime",
                table: "CourseSections");

            migrationBuilder.DropColumn(
                name: "PinHash",
                table: "AspNetUsers");

            migrationBuilder.RenameColumn(
                name: "PcIdentifier",
                table: "Workstations",
                newName: "DeviceIdentifier");

            migrationBuilder.RenameIndex(
                name: "IX_Workstations_PcIdentifier",
                table: "Workstations",
                newName: "IX_Workstations_DeviceIdentifier");

            migrationBuilder.RenameColumn(
                name: "Notes",
                table: "AttendanceSessions",
                newName: "ReviewNotes");

            migrationBuilder.AddColumn<DateTime>(
                name: "LastHeartbeat",
                table: "Workstations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "Workstations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "ConfirmedBy",
                table: "SessionConfirmations",
                type: "nvarchar(450)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "InstructorName",
                table: "CourseSections",
                type: "nvarchar(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsReviewed",
                table: "AttendanceSessions",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "LogoutTime",
                table: "AttendanceSessions",
                type: "datetime2",
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

            migrationBuilder.CreateTable(
                name: "ActivityScores",
                columns: table => new
                {
                    ActivityId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AttendanceId = table.Column<int>(type: "int", nullable: false),
                    ActiveHeartbeats = table.Column<int>(type: "int", nullable: false),
                    CompositeScore = table.Column<decimal>(type: "decimal(5,2)", nullable: false),
                    ComputedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IdleBreachHeartbeats = table.Column<int>(type: "int", nullable: false),
                    PresenceStatus = table.Column<int>(type: "int", nullable: false),
                    TotalHeartbeats = table.Column<int>(type: "int", nullable: false),
                    TotalKeystrokes = table.Column<long>(type: "bigint", nullable: false),
                    TotalMouseEvents = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActivityScores", x => x.ActivityId);
                    table.ForeignKey(
                        name: "FK_ActivityScores_AttendanceSessions_AttendanceId",
                        column: x => x.AttendanceId,
                        principalTable: "AttendanceSessions",
                        principalColumn: "AttendanceId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SessionConfirmations_ConfirmedBy",
                table: "SessionConfirmations",
                column: "ConfirmedBy");

            migrationBuilder.CreateIndex(
                name: "IX_AttendanceSessions_ReviewedByUserId",
                table: "AttendanceSessions",
                column: "ReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ActivityScores_AttendanceId",
                table: "ActivityScores",
                column: "AttendanceId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_AttendanceSessions_AspNetUsers_ReviewedByUserId",
                table: "AttendanceSessions",
                column: "ReviewedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SessionConfirmations_AspNetUsers_ConfirmedBy",
                table: "SessionConfirmations",
                column: "ConfirmedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
