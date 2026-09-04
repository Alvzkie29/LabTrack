using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LabTrack.API.Migrations
{
    /// <inheritdoc />
    public partial class UniqueSeatPerLab : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Workstations_LabId",
                table: "Workstations");

            migrationBuilder.CreateIndex(
                name: "IX_Workstations_LabId_SeatLabel",
                table: "Workstations",
                columns: new[] { "LabId", "SeatLabel" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Workstations_LabId_SeatLabel",
                table: "Workstations");

            migrationBuilder.CreateIndex(
                name: "IX_Workstations_LabId",
                table: "Workstations",
                column: "LabId");
        }
    }
}
