using System.Security.Claims;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class ConfirmAttendanceDto
{
    public string PcIdentifier { get; set; } = string.Empty;
    public int SectionId { get; set; }
}

/// <summary>
/// Endpoints used by the Lightweight PC Agent after the student logs in through api/auth/login.
/// Step 1 (options): suggests the class meeting in this lab right now, plus the other classes
/// meeting in the same lab today for the dropdown. Step 2 (confirm): records the attendance.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Student")]
public class AgentController : ControllerBase
{
    // Philippine time is UTC+8 all year (no daylight saving). Meeting times are local times.
    private const int LabUtcOffsetHours = 8;
    private const int EarlyGraceMinutes = 15; // a student may log in this early before class starts

    private static DateTime LabNow => DateTime.UtcNow.AddHours(LabUtcOffsetHours);

    private readonly ApplicationDbContext _db;
    public AgentController(ApplicationDbContext db) => _db = db;

    /// <summary>Lets the agent check that the server is reachable. No login needed.</summary>
    [HttpGet("health")]
    [AllowAnonymous]
    public IActionResult Health() => Ok();

    [HttpGet("options")]
    public async Task<IActionResult> GetOptions([FromQuery] string pcIdentifier)
    {
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId is null) return Unauthorized();
        if (await MustChangePasswordAsync(userId))
            return StatusCode(StatusCodes.Status403Forbidden, "Please set a new password first.");

        var workstation = await _db.Workstations
            .FirstOrDefaultAsync(w => w.PcIdentifier == pcIdentifier && w.IsActive);
        if (workstation is null) return NotFound("This workstation is not registered in LabTrack.");

        var now = LabNow;
        var time = TimeOnly.FromDateTime(now);
        var today = await GetTodaysMeetingsAsync(workstation.LabId, now);

        // A meeting running right now wins; otherwise the one starting within the early-login window.
        var suggested = today
            .Where(m => time >= m.StartTime && time <= m.EndTime)
            .OrderByDescending(m => m.StartTime)
            .FirstOrDefault()
          ?? today
            .Where(m => time >= m.StartTime.AddMinutes(-EarlyGraceMinutes) && time < m.StartTime)
            .OrderBy(m => m.StartTime)
            .FirstOrDefault();

        return Ok(new
        {
            WorkstationId = workstation.WorkstationId,
            Suggested = suggested is null ? null : ToOption(suggested),
            Alternatives = today
                .Where(m => m.SectionId != suggested?.SectionId)
                .DistinctBy(m => m.SectionId)
                .Select(ToOption)
        });
    }

    [HttpPost("confirm")]
    public async Task<IActionResult> Confirm(ConfirmAttendanceDto dto)
    {
        var studentId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (studentId is null) return Unauthorized();
        if (await MustChangePasswordAsync(studentId))
            return StatusCode(StatusCodes.Status403Forbidden, "Please set a new password first.");

        var workstation = await _db.Workstations
            .FirstOrDefaultAsync(w => w.PcIdentifier == dto.PcIdentifier && w.IsActive);
        if (workstation is null) return NotFound("This workstation is not registered in LabTrack.");

        var now = LabNow;
        var today = await GetTodaysMeetingsAsync(workstation.LabId, now);

        // The chosen class must have a meeting in this lab today.
        var meeting = today.FirstOrDefault(m => m.SectionId == dto.SectionId);
        if (meeting is null) return BadRequest("That class is not scheduled in this laboratory today.");

        // One attendance record per student per class per day.
        var dayStartUtc = now.Date.AddHours(-LabUtcOffsetHours);
        var existing = await _db.AttendanceSessions.FirstOrDefaultAsync(a =>
            a.StudentId == studentId
            && a.SectionId == meeting.SectionId
            && a.LoginTime >= dayStartUtc
            && a.LoginTime < dayStartUtc.AddDays(1));

        if (existing is not null)
            return Ok(new { existing.AttendanceId, AlreadyRecorded = true, Section = ToOption(meeting) });

        var attendance = new AttendanceSession
        {
            StudentId = studentId,
            WorkstationId = workstation.WorkstationId,
            SectionId = meeting.SectionId,
            LoginTime = DateTime.UtcNow
        };
        _db.AttendanceSessions.Add(attendance);
        await _db.SaveChangesAsync();

        return Ok(new { attendance.AttendanceId, AlreadyRecorded = false, Section = ToOption(meeting) });
    }

    /// <summary>A class session in this lab today: a regular lab meeting or a make-up class.</summary>
    private sealed record Slot(int SectionId, CourseSection CourseSection, TimeOnly StartTime, TimeOnly EndTime, bool MakeUp);

    /// <summary>
    /// The sessions in this lab today, for classes of the active semester: the lab meetings of
    /// classes running in the current term, plus the make-up classes set for today.
    /// </summary>
    private async Task<List<Slot>> GetTodaysMeetingsAsync(int labId, DateTime now)
    {
        var day = now.DayOfWeek.ToString(); // "Monday", same format the meetings are saved in
        var date = DateOnly.FromDateTime(now);

        var meetings = await _db.SectionSchedules
            .Include(m => m.CourseSection).ThenInclude(s => s.Subject)
            .Include(m => m.CourseSection).ThenInclude(s => s.AcademicYear)
            .Where(m => m.LabId == labId && m.DayOfWeek == day && m.CourseSection.AcademicYear.IsActive)
            .ToListAsync();

        var makeUps = await _db.MakeUpClasses
            .Include(m => m.CourseSection).ThenInclude(s => s.Subject)
            .Where(m => m.LabId == labId && m.Date == date && m.CourseSection.AcademicYear.IsActive)
            .ToListAsync();

        return meetings
            .Where(m => m.CourseSection.RunsOn(date)) // a 1st-term class is not offered in the 2nd term, and the other way round
            .Select(m => new Slot(m.SectionId, m.CourseSection, m.StartTime, m.EndTime, false))
            .Concat(makeUps.Select(m => new Slot(m.SectionId, m.CourseSection, m.StartTime, m.EndTime, true)))
            .OrderBy(m => m.StartTime)
            .ToList();
    }

    private Task<bool> MustChangePasswordAsync(string userId) =>
        _db.Users.Where(u => u.Id == userId).Select(u => u.MustChangePassword).FirstOrDefaultAsync();

    private static object ToOption(Slot m) => new
    {
        m.SectionId,
        m.CourseSection.SectionCode,
        SubjectCode = m.CourseSection.Subject.Code,
        // The agent shows the title; a make-up class says so.
        SubjectTitle = m.MakeUp ? $"{m.CourseSection.Subject.Title} (make-up class)" : m.CourseSection.Subject.Title,
        m.StartTime,
        m.EndTime
    };
}