using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LabTrack.API.Migrations
{
    /// <inheritdoc />
    public partial class AddLectureRoom : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LectureRoom",
                table: "CourseSections",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LectureRoom",
                table: "CourseSections");
        }
    }
}
