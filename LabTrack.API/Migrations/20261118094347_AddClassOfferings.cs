using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LabTrack.API.Migrations
{
    /// <inheritdoc />
    public partial class AddClassOfferings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ClassOfferings",
                columns: table => new
                {
                    ClassOfferingId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AyId = table.Column<int>(type: "int", nullable: false),
                    ClassCode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    SubjectCode = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Block = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    Term = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    Time = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    Days = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    Room = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    Units = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    Students = table.Column<int>(type: "int", nullable: true),
                    Instructor = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClassOfferings", x => x.ClassOfferingId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ClassOfferings_AyId_ClassCode",
                table: "ClassOfferings",
                columns: new[] { "AyId", "ClassCode" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ClassOfferings");
        }
    }
}
