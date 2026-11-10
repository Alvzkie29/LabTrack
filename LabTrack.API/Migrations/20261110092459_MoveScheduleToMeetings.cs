using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LabTrack.API.Migrations
{
    /// <inheritdoc />
    public partial class MoveScheduleToMeetings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CourseSections_Laboratories_LabId",
                table: "CourseSections");

            migrationBuilder.DropIndex(
                name: "IX_CourseSections_AyId",
                table: "CourseSections");

            migrationBuilder.DropIndex(
                name: "IX_CourseSections_LabId_DayOfWeek",
                table: "CourseSections");

            migrationBuilder.DropIndex(
                name: "IX_CourseSections_SectionCode",
                table: "CourseSections");

            migrationBuilder.DropColumn(
                name: "DayOfWeek",
                table: "CourseSections");

            migrationBuilder.DropColumn(
                name: "EndTime",
                table: "CourseSections");

            migrationBuilder.DropColumn(
                name: "LabId",
                table: "CourseSections");

            migrationBuilder.DropColumn(
                name: "StartTime",
                table: "CourseSections");

            migrationBuilder.CreateIndex(
                name: "IX_CourseSections_AyId_SectionCode",
                table: "CourseSections",
                columns: new[] { "AyId", "SectionCode" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CourseSections_AyId_SectionCode",
                table: "CourseSections");

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

            migrationBuilder.CreateIndex(
                name: "IX_CourseSections_AyId",
                table: "CourseSections",
                column: "AyId");

            migrationBuilder.CreateIndex(
                name: "IX_CourseSections_LabId_DayOfWeek",
                table: "CourseSections",
                columns: new[] { "LabId", "DayOfWeek" });

            migrationBuilder.CreateIndex(
                name: "IX_CourseSections_SectionCode",
                table: "CourseSections",
                column: "SectionCode",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CourseSections_Laboratories_LabId",
                table: "CourseSections",
                column: "LabId",
                principalTable: "Laboratories",
                principalColumn: "LabId",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
