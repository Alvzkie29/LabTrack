using System.Security.Claims;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
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
/// Step 1 (options): suggests the class scheduled in this lab right now, plus the other classes
/// in the same lab today for the dropdown. Step 2 (confirm): records the attendance.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Student")]
public class AgentController : ControllerBase
{
    // Philippine time is UTC+8 all year (no daylight saving). Section schedules are local times.
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
        var workstation = await _db.Workstations
            .FirstOrDefaultAsync(w => w.PcIdentifier == pcIdentifier && w.IsActive);
        if (workstation is null) return NotFound("This workstation is not registered in LabTrack.");

        var now = LabNow;
        var time = TimeOnly.FromDateTime(now);
        var today = await GetTodaysSectionsAsync(workstation.LabId, now);

        var suggested = today
            .Where(s => time >= s.StartTime.AddMinutes(-EarlyGraceMinutes) && time <= s.EndTime)
            .OrderByDescending(s => s.StartTime)
            .FirstOrDefault();

        return Ok(new
        {
            WorkstationId = workstation.WorkstationId,
            Suggested = suggested is null ? null : ToOption(suggested),
            Alternatives = today
                .Where(s => s.SectionId != suggested?.SectionId)
                .Select(ToOption)
        });
    }

    [HttpPost("confirm")]
    public async Task<IActionResult> Confirm(ConfirmAttendanceDto dto)
    {
        var studentId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (studentId is null) return Unauthorized();

        var workstation = await _db.Workstations
            .FirstOrDefaultAsync(w => w.PcIdentifier == dto.PcIdentifier && w.IsActive);
        if (workstation is null) return NotFound("This workstation is not registered in LabTrack.");

        var now = LabNow;
        var today = await GetTodaysSectionsAsync(workstation.LabId, now);

        // The chosen class must be one of today's classes in this lab.
        var section = today.FirstOrDefault(s => s.SectionId == dto.SectionId);
        if (section is null) return BadRequest("That class is not scheduled in this laboratory today.");

        // One attendance record per student per class per day.
        var dayStartUtc = now.Date.AddHours(-LabUtcOffsetHours);
        var existing = await _db.AttendanceSessions.FirstOrDefaultAsync(a =>
            a.StudentId == studentId
            && a.SectionId == section.SectionId
            && a.LoginTime >= dayStartUtc
            && a.LoginTime < dayStartUtc.AddDays(1));

        if (existing is not null)
            return Ok(new { existing.AttendanceId, AlreadyRecorded = true, Section = ToOption(section) });

        var attendance = new AttendanceSession
        {
            StudentId = studentId,
            WorkstationId = workstation.WorkstationId,
            SectionId = section.SectionId,
            LoginTime = DateTime.UtcNow
        };
        _db.AttendanceSessions.Add(attendance);
        await _db.SaveChangesAsync();

        return Ok(new { attendance.AttendanceId, AlreadyRecorded = false, Section = ToOption(section) });
    }

    private Task<List<CourseSection>> GetTodaysSectionsAsync(int labId, DateTime now)
    {
        var day = now.DayOfWeek.ToString(); // "Monday", same format the sections are saved in
        return _db.CourseSections
            .Include(s => s.Subject)
            .Where(s => s.LabId == labId && s.DayOfWeek == day && s.AcademicYear.IsActive)
            .OrderBy(s => s.StartTime)
            .ToListAsync();
    }

    private static object ToOption(CourseSection s) => new
    {
        s.SectionId,
        s.SectionCode,
        SubjectCode = s.Subject.Code,
        SubjectTitle = s.Subject.Title,
        s.StartTime,
        s.EndTime
    };
}