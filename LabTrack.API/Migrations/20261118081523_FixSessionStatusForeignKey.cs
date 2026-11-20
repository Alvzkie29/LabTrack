using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LabTrack.API.Migrations
{
    /// <inheritdoc />
    public partial class FixSessionStatusForeignKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SessionStatuses_CourseSections_CourseSectionSectionId",
                table: "SessionStatuses");

            migrationBuilder.DropIndex(
                name: "IX_SessionStatuses_CourseSectionSectionId",
                table: "SessionStatuses");

            migrationBuilder.DropColumn(
                name: "CourseSectionSectionId",
                table: "SessionStatuses");

            migrationBuilder.AddForeignKey(
                name: "FK_SessionStatuses_CourseSections_SectionId",
                table: "SessionStatuses",
                column: "SectionId",
                principalTable: "CourseSections",
                principalColumn: "SectionId",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SessionStatuses_CourseSections_SectionId",
                table: "SessionStatuses");

            migrationBuilder.AddColumn<int>(
                name: "CourseSectionSectionId",
                table: "SessionStatuses",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_SessionStatuses_CourseSectionSectionId",
                table: "SessionStatuses",
                column: "CourseSectionSectionId");

            migrationBuilder.AddForeignKey(
                name: "FK_SessionStatuses_CourseSections_CourseSectionSectionId",
                table: "SessionStatuses",
                column: "CourseSectionSectionId",
                principalTable: "CourseSections",
                principalColumn: "SectionId",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
