using System.Security.Claims;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class WorkstationLoginDto
{
    public int WorkstationId { get; set; }
    public int SectionId { get; set; }
}

public class ReviewSessionDto
{
    public ReviewOutcome Outcome { get; set; }
    public string? Notes { get; set; }
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AttendanceSessionsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly ActivityScoringService _scoring;

    public AttendanceSessionsController(ApplicationDbContext db, ActivityScoringService scoring)
    {
        _db = db;
        _scoring = scoring;
    }

    /// <summary>
    /// Records a student's login at a specific workstation for a specific course section — the
    /// student/workstation-level layer. Separate from, and never gates, CHED-hour crediting
    /// (which happens independently via SessionConfirmation).
    /// </summary>
    [HttpPost("login")]
    [Authorize(Roles = "Student")]
    public async Task<IActionResult> Login(WorkstationLoginDto dto)
    {
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId is null) return Unauthorized();

        var workstation = await _db.Workstations.FindAsync(dto.WorkstationId);
        var section = await _db.CourseSections.FindAsync(dto.SectionId);
        if (workstation is null) return BadRequest("WorkstationId does not exist.");
        if (section is null) return BadRequest("SectionId does not exist.");

        // Prevent a student from having two simultaneous open sessions.
        var alreadyLoggedIn = await _db.AttendanceSessions
            .AnyAsync(a => a.StudentId == userId && a.LogoutTime == null);
        if (alreadyLoggedIn)
            return BadRequest("You already have an active session. Log out first.");

        var session = new AttendanceSession
        {
            StudentId = userId,
            WorkstationId = dto.WorkstationId,
            SectionId = dto.SectionId,
            LoginTime = DateTime.UtcNow
        };

        workstation.Status = WorkstationStatus.Active;
        workstation.LastHeartbeat = DateTime.UtcNow;

        _db.AttendanceSessions.Add(session);
        await _db.SaveChangesAsync();

        return Ok(new { session.AttendanceId, session.LoginTime });
    }

    /// <summary>Logs the student out and finalizes their session's activity score/presence status.</summary>
    [HttpPost("{id:int}/logout")]
    public async Task<IActionResult> Logout(int id)
    {
        var session = await _db.AttendanceSessions
            .Include(a => a.ActivityScore)
            .Include(a => a.Workstation)
            .FirstOrDefaultAsync(a => a.AttendanceId == id);

        if (session is null) return NotFound();
        if (session.LogoutTime is not null) return BadRequest("Session already logged out.");

        session.LogoutTime = DateTime.UtcNow;

        if (session.ActivityScore is not null)
        {
            _scoring.Recompute(session.ActivityScore);
        }

        session.Workstation.Status = WorkstationStatus.Offline;

        await _db.SaveChangesAsync();

        return Ok(new
        {
            session.AttendanceId,
            session.LogoutTime,
            ActivityScore = session.ActivityScore?.CompositeScore,
            PresenceStatus = session.ActivityScore?.PresenceStatus.ToString()
        });
    }

    /// <summary>Unresolved sessions flagged by the activity scoring algorithm as likely proxy logins / abandoned sessions.</summary>
    [HttpGet("flagged")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> GetFlagged()
    {
        var flagged = await _db.AttendanceSessions
            .Where(a => a.ActivityScore != null && a.ActivityScore.PresenceStatus == PresenceStatus.Flagged && !a.IsReviewed)
            .Include(a => a.Student)
            .Include(a => a.Workstation)
            .Include(a => a.CourseSection).ThenInclude(cs => cs.Subject)
            .Include(a => a.ActivityScore)
            .OrderByDescending(a => a.LoginTime)
            .Select(a => new
            {
                a.AttendanceId,
                Student = a.Student.FullName,
                StudentSchoolId = a.Student.SchoolId,
                Workstation = a.Workstation.SeatLabel,
                Section = a.CourseSection.SectionCode,
                a.ActivityScore!.CompositeScore,
                a.LoginTime,
                a.LogoutTime
            })
            .ToListAsync();

        return Ok(flagged);
    }

    /// <summary>
    /// Records a human decision on a flagged session — Accepted (genuine session despite the low
    /// score) or Rejected (treated as a likely proxy login). This never alters CHED-hour crediting
    /// (that's independent, at the SessionConfirmation level); it only resolves the flag for
    /// monitoring/reporting purposes and writes an audit trail entry.
    /// </summary>
    [HttpPost("{id:int}/review")]
    [Authorize(Roles = "Custodian,Administrator")]
    public async Task<IActionResult> Review(int id, [FromBody] ReviewSessionDto dto)
    {
        var session = await _db.AttendanceSessions.FindAsync(id);
        if (session is null) return NotFound();
        if (session.IsReviewed) return BadRequest("This session has already been reviewed.");

        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId is null) return Unauthorized();

        session.IsReviewed = true;
        session.ReviewOutcome = dto.Outcome;
        session.ReviewedByUserId = userId;
        session.ReviewedAt = DateTime.UtcNow;
        session.ReviewNotes = dto.Notes;

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Action = "SessionReviewed",
            EntityType = nameof(AttendanceSession),
            EntityId = session.AttendanceId.ToString(),
            Details = $"Outcome={dto.Outcome}, Notes={dto.Notes}"
        });

        await _db.SaveChangesAsync();

        return Ok(new { session.AttendanceId, session.IsReviewed, session.ReviewOutcome, session.ReviewedAt });
    }

    /// <summary>
    /// Staff-facing attendance report: the raw record set for a section and/or date range,
    /// meant to be exported/printed as-is for CHED documentation or department reporting —
    /// there is no separate "submission" or "review" step; this query result IS the report.
    /// </summary>
    [HttpGet("report")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> GetReport(
        [FromQuery] int? sectionId,
        [FromQuery] int? labId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var query = _db.AttendanceSessions
            .Include(a => a.Student)
            .Include(a => a.Workstation)
            .Include(a => a.CourseSection)
            .Include(a => a.ActivityScore)
            .AsQueryable();

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
                a.LoginTime,
                a.LogoutTime,
                ActivityScore = a.ActivityScore != null ? a.ActivityScore.CompositeScore : (decimal?)null,
                PresenceStatus = a.ActivityScore != null ? a.ActivityScore.PresenceStatus.ToString() : null,
                a.IsReviewed,
                ReviewOutcome = a.ReviewOutcome != null ? a.ReviewOutcome.ToString() : null,
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
            .Include(a => a.CourseSection)
            .Include(a => a.Workstation)
            .Include(a => a.ActivityScore)
            .OrderByDescending(a => a.LoginTime)
            .Select(a => new
            {
                a.AttendanceId,
                Section = a.CourseSection.SectionCode,
                Workstation = a.Workstation.SeatLabel,
                a.LoginTime,
                a.LogoutTime,
                ActivityScore = a.ActivityScore != null ? a.ActivityScore.CompositeScore : (decimal?)null
            })
            .ToListAsync();

        return Ok(sessions);
    }
}