using System.Security.Claims;
using LabTrack.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AttendanceSessionsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public AttendanceSessionsController(ApplicationDbContext db) => _db = db;

    /// <summary>
    /// Staff-facing attendance report: the raw record set for a section and/or date range.
    /// Shows which workstation each student used and when.
    /// </summary>
    [HttpGet("report")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> GetReport(
        [FromQuery] int? sectionId,
        [FromQuery] int? labId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var query = _db.AttendanceSessions.AsQueryable();

        if (sectionId.HasValue) query = query.Where(a => a.SectionId == sectionId.Value);
        if (labId.HasValue) query = query.Where(a => a.Workstation.LabId == labId.Value);
        if (from.HasValue) query = query.Where(a => a.LoginTime >= from.Value);
        if (to.HasValue) query = query.Where(a => a.LoginTime <= to.Value.AddDays(1)); // inclusive of the whole "to" day

        var rows = await query
            .OrderBy(a => a.LoginTime)
            .Select(a => new
            {
                a.AttendanceId,
                Student = a.Student.FullName,
                StudentSchoolId = a.Student.SchoolId,
                Section = a.CourseSection.SectionCode,
                Workstation = a.Workstation.SeatLabel,
                a.Workstation.PcIdentifier,
                a.LoginTime,
                a.Notes
            })
            .ToListAsync();

        return Ok(rows);
    }

    /// <summary>The logged-in student's own attendance history.</summary>
    [HttpGet("mine")]
    [Authorize(Roles = "Student")]
    public async Task<IActionResult> Mine()
    {
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        var sessions = await _db.AttendanceSessions
            .Where(a => a.StudentId == userId)
            .OrderByDescending(a => a.LoginTime)
            .Select(a => new
            {
                a.AttendanceId,
                Section = a.CourseSection.SectionCode,
                Workstation = a.Workstation.SeatLabel,
                a.LoginTime
            })
            .ToListAsync();

        return Ok(sessions);
    }
}