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

    /// <summary>
    /// Who attended one class on one day: rostered students split into present and absent,
    /// plus students who logged in for this class but are not on its roster.
    /// </summary>
    [HttpGet("by-section/{sectionId:int}")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> GetBySection(int sectionId, [FromQuery] DateOnly? date)
    {
        var section = await _db.CourseSections
            .Include(s => s.Subject)
            .FirstOrDefaultAsync(s => s.SectionId == sectionId);
        if (section is null) return NotFound();

        // Philippine time is UTC+8; login times are stored in UTC.
        const int utcOffsetHours = 8;
        var day = date ?? DateOnly.FromDateTime(DateTime.UtcNow.AddHours(utcOffsetHours));
        var dayStartUtc = day.ToDateTime(TimeOnly.MinValue).AddHours(-utcOffsetHours);
        var dayEndUtc = dayStartUtc.AddDays(1);
        var weekday = day.DayOfWeek.ToString();
        var meetings = await _db.SectionSchedules
            .Where(m => m.SectionId == sectionId && m.DayOfWeek == weekday)
            .OrderBy(m => m.StartTime)
            .Select(m => new { m.StartTime, m.EndTime, Lab = m.Laboratory.RoomCode })
            .ToListAsync();

        var logins = await _db.AttendanceSessions
            .Where(a => a.SectionId == sectionId && a.LoginTime >= dayStartUtc && a.LoginTime < dayEndUtc)
            .Select(a => new
            {
                a.AttendanceId,
                a.StudentId,
                a.Student.SchoolId,
                Name = a.Student.FullName,
                Workstation = a.Workstation.SeatLabel,
                a.Workstation.PcIdentifier,
                a.LoginTime,
                a.Notes
            })
            .ToListAsync();

        var roster = await _db.SectionEnrollments
            .Where(e => e.SectionId == sectionId)
            .Select(e => new { e.StudentId, e.Student.SchoolId, Name = e.Student.FullName })
            .ToListAsync();

        // If a student logged in twice, keep the first login.
        var loginByStudent = logins
            .GroupBy(l => l.StudentId)
            .ToDictionary(g => g.Key, g => g.OrderBy(l => l.LoginTime).First());
        var rosterIds = roster.Select(r => r.StudentId).ToHashSet();

        object ToRow(string studentId) => ToLoginRow(loginByStudent[studentId], utcOffsetHours);

        var present = roster
            .Where(r => loginByStudent.ContainsKey(r.StudentId))
            .OrderBy(r => r.Name)
            .Select(r => ToRow(r.StudentId))
            .ToList();

        var absent = roster
            .Where(r => !loginByStudent.ContainsKey(r.StudentId))
            .OrderBy(r => r.Name)
            .Select(r => new { r.StudentId, r.SchoolId, r.Name })
            .ToList();

        var notOnRoster = loginByStudent.Keys
            .Where(id => !rosterIds.Contains(id))
            .OrderBy(id => loginByStudent[id].Name)
            .Select(ToRow)
            .ToList();

        return Ok(new
        {
            Section = new
            {
                section.SectionId,
                section.SectionCode,
                SubjectCode = section.Subject.Code,
                SubjectTitle = section.Subject.Title,
                Meetings = meetings
            },
            Date = day,
            RosterCount = roster.Count,
            PresentCount = present.Count,
            AbsentCount = absent.Count,
            Present = present,
            Absent = absent,
            NotOnRoster = notOnRoster
        });
    }

    private static object ToLoginRow(dynamic login, int utcOffsetHours) => new
    {
        login.AttendanceId,
        login.StudentId,
        login.SchoolId,
        login.Name,
        login.Workstation,
        login.PcIdentifier,
        LoginTime = ((DateTime)login.LoginTime).AddHours(utcOffsetHours),
        login.Notes
    };

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