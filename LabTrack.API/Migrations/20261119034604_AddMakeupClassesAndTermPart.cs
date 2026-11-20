using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LabTrack.API.Migrations
{
    /// <inheritdoc />
    public partial class AddMakeupClassesAndTermPart : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TermPart",
                table: "CourseSections",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "MakeUpClasses",
                columns: table => new
                {
                    MakeUpId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SectionId = table.Column<int>(type: "int", nullable: false),
                    LabId = table.Column<int>(type: "int", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    AttachmentName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AttachmentStoredName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AttachmentContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MakeUpClasses", x => x.MakeUpId);
                    table.ForeignKey(
                        name: "FK_MakeUpClasses_AspNetUsers_CreatedBy",
                        column: x => x.CreatedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MakeUpClasses_CourseSections_SectionId",
                        column: x => x.SectionId,
                        principalTable: "CourseSections",
                        principalColumn: "SectionId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MakeUpClasses_Laboratories_LabId",
                        column: x => x.LabId,
                        principalTable: "Laboratories",
                        principalColumn: "LabId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MakeUpClasses_CreatedBy",
                table: "MakeUpClasses",
                column: "CreatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_MakeUpClasses_LabId_Date",
                table: "MakeUpClasses",
                columns: new[] { "LabId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_MakeUpClasses_SectionId_Date",
                table: "MakeUpClasses",
                columns: new[] { "SectionId", "Date" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MakeUpClasses");

            migrationBuilder.DropColumn(
                name: "TermPart",
                table: "CourseSections");
        }
    }
}
