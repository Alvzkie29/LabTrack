using System.Security.Claims;
using LabTrack.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
namespace LabTrack.Api.Controllers;

public class ManualAttendanceDto
{
    public int SectionId { get; set; }
    public string StudentId { get; set; } = string.Empty;
    public DateOnly Date { get; set; }
    public int WorkstationId { get; set; }
    public string Note { get; set; } = string.Empty;
}

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
        [FromQuery] DateTime? to,
        [FromQuery] int? ayId)
    {
        // The semester's classes only (the active semester by default).
        var semester = await ayId.OrActiveAsync(_db);
        var query = _db.AttendanceSessions.Where(a => a.CourseSection.AyId == semester);

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
        // A make-up class that day counts as a meeting too.
        meetings.AddRange(await _db.MakeUpClasses
            .Where(m => m.SectionId == sectionId && m.Date == day)
            .Select(m => new { m.StartTime, m.EndTime, Lab = m.Laboratory.RoomCode })
            .ToListAsync());

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
    /// <summary>
    /// The login history of one workstation: which student used this PC, for which class, and
    /// when. Newest first. "from" and "to" are local (Philippine) dates, both inclusive.
    /// </summary>
    [HttpGet("by-workstation/{workstationId:int}")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> GetByWorkstation(
        int workstationId,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] int limit = 100)
    {
        // Philippine time is UTC+8; login times are stored in UTC.
        const int utcOffsetHours = 8;
        limit = Math.Clamp(limit, 1, 500);

        var workstation = await _db.Workstations
            .Where(w => w.WorkstationId == workstationId)
            .Select(w => new
            {
                w.WorkstationId,
                w.SeatLabel,
                w.PcIdentifier,
                Lab = w.Laboratory.RoomCode,
                w.IsActive
            })
            .FirstOrDefaultAsync();

        if (workstation is null) return NotFound("This workstation is not registered in LabTrack.");

        var query = _db.AttendanceSessions.Where(a => a.WorkstationId == workstationId);

        if (from.HasValue)
        {
            var fromUtc = from.Value.ToDateTime(TimeOnly.MinValue).AddHours(-utcOffsetHours);
            query = query.Where(a => a.LoginTime >= fromUtc);
        }
        if (to.HasValue)
        {
            var toUtc = to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue).AddHours(-utcOffsetHours);
            query = query.Where(a => a.LoginTime < toUtc);
        }

        var total = await query.CountAsync();

        var logins = await query
            .OrderByDescending(a => a.LoginTime)
            .Take(limit)
            .Select(a => new
            {
                a.AttendanceId,
                Student = a.Student.FirstName + " " + a.Student.LastName,
                a.Student.SchoolId,
                Section = a.CourseSection.SectionCode,
                SubjectCode = a.CourseSection.Subject.Code,
                a.LoginTime,
                a.Notes
            })
            .ToListAsync();

        return Ok(new
        {
            Workstation = workstation,
            Total = total,
            Logins = logins.Select(l => new
            {
                l.AttendanceId,
                l.Student,
                l.SchoolId,
                l.Section,
                l.SubjectCode,
                LoginTime = l.LoginTime.AddHours(utcOffsetHours),
                l.Notes
            })
        });
    }
    /// <summary>
    /// Staff record a student as present by hand, for a session the PC Agent could not record
    /// (server and Master PC both unreachable). The student must be on the class list, the
    /// note is required, and the entry is labelled as manual and written to the audit log.
    /// Not allowed once the session has its final confirmation.
    /// </summary>
    [HttpPost("manual")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> RecordManual(ManualAttendanceDto dto)
    {
        const int utcOffsetHours = 8; // Philippine time

        var staffId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (staffId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(dto.Note) || dto.Note.Trim().Length < 5)
            return BadRequest("Please give a reason for the manual entry.");

        var enrolled = await _db.SectionEnrollments
            .AnyAsync(e => e.SectionId == dto.SectionId && e.StudentId == dto.StudentId);
        if (!enrolled) return BadRequest("That student is not on this class's list.");

        // The class must meet that day (a lab meeting in its term, or a make-up class), and the PC
        // must be in the lab it meets in.
        var weekday = dto.Date.DayOfWeek.ToString();
        var section = await _db.CourseSections.Include(c => c.AcademicYear).FirstOrDefaultAsync(c => c.SectionId == dto.SectionId);
        if (section is null) return NotFound();
        var meetings = await _db.SectionSchedules
            .Where(m => m.SectionId == dto.SectionId && m.DayOfWeek == weekday)
            .OrderBy(m => m.StartTime)
            .Select(m => new { m.LabId, m.StartTime })
            .ToListAsync();
        if (!section.RunsOn(dto.Date)) meetings.Clear(); // outside the class's term
        meetings.AddRange(await _db.MakeUpClasses
            .Where(m => m.SectionId == dto.SectionId && m.Date == dto.Date)
            .Select(m => new { m.LabId, m.StartTime })
            .ToListAsync());
        if (meetings.Count == 0) return BadRequest("This class has no lab meeting or make-up class on that date.");

        var workstation = await _db.Workstations.FirstOrDefaultAsync(w => w.WorkstationId == dto.WorkstationId);
        if (workstation is null || !meetings.Any(m => m.LabId == workstation.LabId))
            return BadRequest("That PC is not in the laboratory this class meets in on that day.");

        var sessionDate = dto.Date.ToDateTime(TimeOnly.MinValue);
        var finalised = await _db.SessionConfirmations.AnyAsync(sc =>
            sc.SectionId == dto.SectionId
            && sc.SessionDate == sessionDate
            && sc.SessionType == SessionType.Physical
            && sc.FinalConfirmedAt != null);
        if (finalised) return BadRequest("This session already has its final confirmation.");

        // One attendance record per student per class per day.
        var dayStartUtc = sessionDate.AddHours(-utcOffsetHours);
        var exists = await _db.AttendanceSessions.AnyAsync(a =>
            a.StudentId == dto.StudentId
            && a.SectionId == dto.SectionId
            && a.LoginTime >= dayStartUtc
            && a.LoginTime < dayStartUtc.AddDays(1));
        if (exists) return BadRequest("This student already has an attendance record for that day.");

        // There was no real login, so the record carries the start time of the class meeting.
        var meeting = meetings.First(m => m.LabId == workstation.LabId);
        var loginUtc = dto.Date.ToDateTime(meeting.StartTime).AddHours(-utcOffsetHours);

        var attendance = new AttendanceSession
        {
            StudentId = dto.StudentId,
            WorkstationId = workstation.WorkstationId,
            SectionId = dto.SectionId,
            LoginTime = loginUtc,
            Notes = $"Manual entry: {dto.Note.Trim()}"
        };
        _db.AttendanceSessions.Add(attendance);
        await _db.SaveChangesAsync(); // generates AttendanceId

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = staffId,
            Action = "AttendanceManuallyRecorded",
            EntityType = nameof(AttendanceSession),
            EntityId = attendance.AttendanceId.ToString(),
            Details = $"SectionId={dto.SectionId}, SessionDate={dto.Date:yyyy-MM-dd}, Pc={workstation.PcIdentifier}, Note={dto.Note.Trim()}",
            IpAddress = this.CallerIp(),
        });
        await _db.SaveChangesAsync();

        return Ok(new { attendance.AttendanceId });
    }
}