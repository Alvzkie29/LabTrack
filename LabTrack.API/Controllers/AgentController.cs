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
/// Step 1 (options): suggests an enrolled class whose attendance window is open and explains
/// why the other classes in this lab today are unavailable. Step 2 independently verifies
/// enrollment and the scheduled attendance window before recording attendance.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Student")]
public class AgentController : ControllerBase
{
    // Philippine time is UTC+8 all year (no daylight saving). Meeting times are local times.
    private const int LabUtcOffsetHours = 8;
    private readonly ApplicationDbContext _db;
    private readonly TimeProvider _clock;
    public AgentController(ApplicationDbContext db, TimeProvider? clock = null)
    {
        _db = db;
        _clock = clock ?? TimeProvider.System;
    }

    private DateTime LabNow => _clock.GetUtcNow().UtcDateTime.AddHours(LabUtcOffsetHours);

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
        var today = await GetTodaysMeetingsAsync(workstation.LabId, now);
        var enrolledSections = (await _db.SectionEnrollments
            .Where(e => e.StudentId == userId).Select(e => e.SectionId).ToListAsync()).ToHashSet();
        // A section may have both a regular meeting and a make-up today. Keep its open
        // window before collapsing to one dropdown row, so an earlier slot cannot hide it.
        // Only the signed-in student's assigned sections are shown in the agent.
        var choices = today.Where(m => enrolledSections.Contains(m.SectionId))
            .GroupBy(m => m.SectionId).Select(g => PickMeeting(g, now)).ToList();

        // An enrolled meeting in progress wins over a meeting in its early-login window.
        var suggested = choices
            .Where(m => Eligibility(m, true, now).CanConfirm)
            .OrderBy(m => now < now.Date.Add(m.StartTime.ToTimeSpan()))
            .ThenBy(m => now >= now.Date.Add(m.StartTime.ToTimeSpan()) ? -m.StartTime.Ticks : m.StartTime.Ticks)
            .ThenBy(m => m.SectionId)
            .FirstOrDefault();
        var hasAssignedToday = choices.Count > 0;

        return Ok(new
        {
            WorkstationId = workstation.WorkstationId,
            ScheduleMessage = suggested is not null
                ? "This session matches your class list and this laboratory's schedule."
                : hasAssignedToday
                    ? $"None of your assigned sessions is open now. You may confirm up to {AgentSessionEligibility.EarlyGraceMinutes} minutes before a session starts and before it ends."
                    : "You have no assigned classes in this laboratory today. Please ask laboratory staff to check your class list and schedule.",
            Suggested = suggested is null ? null : ToOption(suggested, true, now),
            Alternatives = choices
                .Where(m => m.SectionId != suggested?.SectionId)
                .Select(m => ToOption(m, true, now))
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
        var isEnrolled = await _db.SectionEnrollments.AnyAsync(e => e.StudentId == studentId && e.SectionId == dto.SectionId);
        if (!isEnrolled)
            return StatusCode(StatusCodes.Status403Forbidden, "Not assigned to you. You are not on this class list.");
        var today = await GetTodaysMeetingsAsync(workstation.LabId, now);

        // Never trust the dropdown: verify roster, lab, day, term and time on every POST.
        var matches = today.Where(m => m.SectionId == dto.SectionId).ToList();
        var meeting = matches.Count == 0 ? null : PickMeeting(matches, now);
        if (meeting is null) return BadRequest("That class is not scheduled in this laboratory today.");
        var eligibility = Eligibility(meeting, true, now);
        if (!eligibility.CanConfirm) return BadRequest(eligibility.Message);

        // One attendance record per student per class per day.
        var dayStartUtc = now.Date.AddHours(-LabUtcOffsetHours);
        var existing = await _db.AttendanceSessions.FirstOrDefaultAsync(a =>
            a.StudentId == studentId
            && a.SectionId == meeting.SectionId
            && a.LoginTime >= dayStartUtc
            && a.LoginTime < dayStartUtc.AddDays(1));

        if (existing is not null)
            return Ok(new { existing.AttendanceId, AlreadyRecorded = true, Section = ToOption(meeting, true, now) });

        var attendance = new AttendanceSession
        {
            StudentId = studentId,
            WorkstationId = workstation.WorkstationId,
            SectionId = meeting.SectionId,
            LoginTime = _clock.GetUtcNow().UtcDateTime
        };
        _db.AttendanceSessions.Add(attendance);
        await _db.SaveChangesAsync();

        return Ok(new { attendance.AttendanceId, AlreadyRecorded = false, Section = ToOption(meeting, true, now) });
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
        var localDate = now.Date;

        var meetings = await _db.SectionSchedules
            .Include(m => m.CourseSection).ThenInclude(s => s.Subject)
            .Include(m => m.CourseSection).ThenInclude(s => s.AcademicYear)
            .Where(m => m.LabId == labId && m.DayOfWeek == day && m.CourseSection.AcademicYear.IsActive
                && m.CourseSection.AcademicYear.StartDate.Date <= localDate && m.CourseSection.AcademicYear.EndDate.Date >= localDate)
            .ToListAsync();

        var makeUps = await _db.MakeUpClasses
            .Include(m => m.CourseSection).ThenInclude(s => s.Subject)
            .Include(m => m.CourseSection).ThenInclude(s => s.AcademicYear)
            .Where(m => m.LabId == labId && m.Date == date && m.CourseSection.AcademicYear.IsActive
                && m.CourseSection.AcademicYear.StartDate.Date <= localDate && m.CourseSection.AcademicYear.EndDate.Date >= localDate)
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

    private static AgentSessionEligibility Eligibility(Slot m, bool enrolled, DateTime now) =>
        AgentSessionEligibility.Evaluate(enrolled, now, m.StartTime, m.EndTime);

    private static Slot PickMeeting(IEnumerable<Slot> meetings, DateTime now) => meetings
        .OrderBy(m => Eligibility(m, true, now).CanConfirm ? 0 : now < now.Date.Add(m.StartTime.ToTimeSpan()) ? 1 : 2)
        .ThenBy(m => Eligibility(m, true, now).CanConfirm && now >= now.Date.Add(m.StartTime.ToTimeSpan()) ? 0 : 1)
        .ThenBy(m => Eligibility(m, true, now).CanConfirm && now >= now.Date.Add(m.StartTime.ToTimeSpan()) ? -m.StartTime.Ticks : m.StartTime.Ticks)
        .First();

    private static object ToOption(Slot m, bool enrolled, DateTime now)
    {
        var eligibility = Eligibility(m, enrolled, now);
        return new
        {
            m.SectionId,
            m.CourseSection.SectionCode,
            SubjectCode = m.CourseSection.Subject.Code,
            SubjectTitle = m.MakeUp ? $"{m.CourseSection.Subject.Title} (make-up class)" : m.CourseSection.Subject.Title,
            m.StartTime,
            m.EndTime,
            eligibility.IsEnrolled,
            eligibility.CanConfirm,
            EligibilityMessage = eligibility.Message,
            EligibilityStatus = eligibility.Status
        };
    }
}