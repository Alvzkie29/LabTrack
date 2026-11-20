using System.Security.Claims;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class MarkSessionStatusDto
{
    public int SectionId { get; set; }
    public DateOnly SessionDate { get; set; }
    /// <summary>One of the manual statuses. Empty or null clears the mark.</summary>
    public string? Status { get; set; }
    public string? Note { get; set; }
}

/// <summary>
/// The class status grid: for one laboratory and one week (Monday to Friday), the state of every
/// class meeting, in the shape of the Laboratory Management Office's monitoring sheet.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "LabAssistant,Custodian,Administrator")]
public class SessionStatusController : ControllerBase
{
    private const int UtcOffsetHours = 8; // Philippine time

    // The Assistants' shifts: a class belongs to the shift its lab meeting starts in.
    private static readonly TimeOnly AfternoonStarts = new(12, 0);
    private static readonly TimeOnly EveningStarts = new(17, 30);

    private readonly ApplicationDbContext _db;
    public SessionStatusController(ApplicationDbContext db) => _db = db;

    /// <summary>Monday = 0 ... Saturday = 5, Sunday = 6.</summary>
    private static int DayIndex(DayOfWeek day) => ((int)day + 6) % 7;
    private static DateOnly MondayOf(DateOnly date) => date.AddDays(-DayIndex(date.DayOfWeek));

    private static string ShiftOf(TimeOnly start) =>
        start < AfternoonStarts ? "Morning" : start < EveningStarts ? "Afternoon" : "Evening";

    [HttpGet("week")]
    public async Task<IActionResult> GetWeek([FromQuery] int labId, [FromQuery] int ayId, [FromQuery] DateOnly? weekStart)
    {
        var lab = await _db.Laboratories.FindAsync(labId);
        if (lab is null) return NotFound("Laboratory not found.");
        if (!await _db.AcademicYears.AnyAsync(a => a.AyId == ayId)) return NotFound("Academic year not found.");

        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(UtcOffsetHours));
        var monday = MondayOf(weekStart ?? today);
        var days = Enumerable.Range(0, 5).Select(i => monday.AddDays(i)).ToList(); // Monday to Friday
        var friday = days[^1];

        // The classes that meet in this lab, and those with a make-up class here this week.
        var sections = await _db.CourseSections
            .Include(c => c.Subject)
            .Include(c => c.Faculty)
            .Include(c => c.Schedules)
            .Include(c => c.AcademicYear)
            .Where(c => c.AyId == ayId && (c.Schedules.Any(m => m.LabId == labId)
                || c.MakeUpClasses.Any(m => m.LabId == labId && m.Date >= monday && m.Date <= friday)))
            .ToListAsync();
        var sectionIds = sections.Select(s => s.SectionId).ToList();

        var makeUps = await _db.MakeUpClasses
            .Where(m => m.LabId == labId && m.Date >= monday && m.Date <= friday && sectionIds.Contains(m.SectionId))
            .ToListAsync();

        var mondayDt = monday.ToDateTime(TimeOnly.MinValue);
        var fridayDt = friday.ToDateTime(TimeOnly.MinValue);

        var confirmations = await _db.SessionConfirmations
            .Where(sc => sectionIds.Contains(sc.SectionId) && sc.SessionDate >= mondayDt && sc.SessionDate <= fridayDt)
            .Select(sc => new { sc.SectionId, sc.SessionDate, sc.SessionType, sc.FinalConfirmedAt })
            .ToListAsync();

        var marks = await _db.SessionStatuses
            .Where(s => sectionIds.Contains(s.SectionId) && s.SessionDate >= monday && s.SessionDate <= friday)
            .ToListAsync();

        // Which classes had any student login on which day, for the suggestions.
        var fromUtc = mondayDt.AddHours(-UtcOffsetHours);
        var toUtc = fridayDt.AddDays(1).AddHours(-UtcOffsetHours);
        var loginDays = (await _db.AttendanceSessions
                .Where(a => sectionIds.Contains(a.SectionId) && a.LoginTime >= fromUtc && a.LoginTime < toUtc)
                .Select(a => new { a.SectionId, a.LoginTime })
                .ToListAsync())
            .Select(a => (a.SectionId, Date: DateOnly.FromDateTime(a.LoginTime.AddHours(UtcOffsetHours))))
            .ToHashSet();

        var rosterCounts = await _db.SectionEnrollments
            .Where(e => sectionIds.Contains(e.SectionId))
            .GroupBy(e => e.SectionId)
            .Select(g => new { SectionId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.SectionId, x => x.Count);

        var unmarked = 0;

        var rows = sections.Select(s =>
        {
            var labMeetings = s.Schedules.Where(m => m.LabId == labId).OrderBy(m => m.StartTime).ToList();
            var classMakeUps = makeUps.Where(m => m.SectionId == s.SectionId).OrderBy(m => m.Date).ToList();
            var startTime = labMeetings.Count > 0 ? labMeetings[0].StartTime : classMakeUps[0].StartTime;
            var endTime = labMeetings.Count > 0 ? labMeetings[0].EndTime : classMakeUps[0].EndTime;

            var cells = days.Select(date =>
            {
                var weekday = date.DayOfWeek.ToString();
                // A regular meeting counts only in the class's own term; a make-up class always does.
                var makeUp = classMakeUps.Any(m => m.Date == date);
                var meets = makeUp || (labMeetings.Any(m => m.DayOfWeek == weekday) && s.RunsOn(date));
                if (!meets) return new StatusCell(date, false, null, null, null, null, false);

                var dateDt = date.ToDateTime(TimeOnly.MinValue);
                var confirmed = confirmations.Where(c => c.SectionId == s.SectionId && c.SessionDate == dateDt).ToList();

                var physical = confirmed.FirstOrDefault(c => c.SessionType == SessionType.Physical);
                if (physical is not null)
                    return new StatusCell(date, true, SessionStatuses.OnSite, "confirmation", null, null, physical.FinalConfirmedAt is null, makeUp);

                if (confirmed.Any(c => c.SessionType == SessionType.Virtual))
                    return new StatusCell(date, true, SessionStatuses.Virtual, "confirmation", null, null, false, makeUp);

                var mark = marks.FirstOrDefault(m => m.SectionId == s.SectionId && m.SessionDate == date);
                if (mark is not null)
                    return new StatusCell(date, true, mark.Status, "marked", mark.Note, null, false, makeUp);

                // A past meeting with nothing recorded: suggest the likely reason.
                if (date < today)
                {
                    unmarked++;
                    var suggestion = loginDays.Contains((s.SectionId, date))
                        ? SessionStatuses.NoTeacher            // students came, nobody confirmed
                        : SessionStatuses.NoStudentsNoTeacher; // nobody logged in at all
                    return new StatusCell(date, true, null, null, null, suggestion, false, makeUp);
                }

                return new StatusCell(date, true, null, null, null, null, false, makeUp); // today or later
            }).ToList();

            return new
            {
                s.SectionId,
                s.SectionCode,
                SubjectCode = s.Subject.Code,
                SubjectTitle = s.Subject.Title,
                Faculty = s.Faculty?.FullName,
                StartTime = startTime,
                EndTime = endTime,
                Shift = ShiftOf(startTime),
                Students = rosterCounts.GetValueOrDefault(s.SectionId),
                s.LectureRoom, // the class's lecture room; the "Virtual Lab" column
                Cells = cells
            };
        })
        .Where(r => r.Cells.Any(c => c.Meets)) // a class outside its term this week is left out
        .OrderBy(r => r.Shift switch { "Morning" => 0, "Afternoon" => 1, _ => 2 })
        .ThenBy(r => r.StartTime)
        .ThenBy(r => r.SectionCode, StringComparer.Ordinal)
        .ToList();

        return Ok(new
        {
            Laboratory = new { lab.LabId, lab.Name, lab.RoomCode },
            WeekStart = monday,
            Days = days,
            Statuses = SessionStatuses.Manual,
            Unmarked = unmarked,
            Rows = rows
        });
    }

    /// <summary>Marks, changes or clears the status of one class meeting.</summary>
    [HttpPut]
    public async Task<IActionResult> Mark(MarkSessionStatusDto dto)
    {
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId is null) return Unauthorized();

        var section = await _db.CourseSections
            .Include(c => c.Schedules)
            .Include(c => c.AcademicYear)
            .FirstOrDefaultAsync(c => c.SectionId == dto.SectionId);
        if (section is null) return NotFound("Class not found.");

        var weekday = dto.SessionDate.DayOfWeek.ToString();
        var regular = section.Schedules.Any(m => m.DayOfWeek == weekday) && section.RunsOn(dto.SessionDate);
        if (!regular && !await _db.MakeUpClasses.AnyAsync(m => m.SectionId == dto.SectionId && m.Date == dto.SessionDate))
            return BadRequest("This class has no lab meeting or make-up class on that date.");

        var status = (dto.Status ?? string.Empty).Trim();
        var note = string.IsNullOrWhiteSpace(dto.Note) ? null : dto.Note.Trim();

        if (status.Length > 0)
        {
            if (status is SessionStatuses.OnSite or SessionStatuses.Virtual)
                return BadRequest("On-site comes from the session confirmation, not from marking it here.");
            if (!SessionStatuses.Manual.Contains(status))
                return BadRequest($"Status must be one of: {string.Join(", ", SessionStatuses.Manual)}.");
            if (status == SessionStatuses.Others && note is null)
                return BadRequest("Please describe the reason when choosing Others.");
            if (note is { Length: > 300 })
                return BadRequest("The note can be at most 300 characters.");
        }

        var dateDt = dto.SessionDate.ToDateTime(TimeOnly.MinValue);
        if (await _db.SessionConfirmations.AnyAsync(sc => sc.SectionId == dto.SectionId && sc.SessionDate == dateDt))
            return BadRequest("This class was confirmed for that date, so its status comes from the confirmation.");

        var existing = await _db.SessionStatuses.FirstOrDefaultAsync(s =>
            s.SectionId == dto.SectionId && s.SessionDate == dto.SessionDate);

        if (status.Length == 0)
        {
            if (existing is null) return Ok(new { Status = (string?)null });
            _db.SessionStatuses.Remove(existing);
        }
        else if (existing is null)
        {
            _db.SessionStatuses.Add(new SessionStatus
            {
                SectionId = dto.SectionId,
                SessionDate = dto.SessionDate,
                Status = status,
                Note = note,
                UpdatedBy = userId
            });
        }
        else
        {
            existing.Status = status;
            existing.Note = note;
            existing.UpdatedBy = userId;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Action = "SessionStatusMarked",
            EntityType = nameof(SessionStatus),
            EntityId = $"{dto.SectionId}/{dto.SessionDate:yyyy-MM-dd}",
            Details = $"SectionId={dto.SectionId}, SessionDate={dto.SessionDate:yyyy-MM-dd}, Status={(status.Length == 0 ? "(cleared)" : status)}"
                      + (note is null ? "" : $", Note={note}"),
            IpAddress = this.CallerIp(),
        });
        await _db.SaveChangesAsync();

        return Ok(new { Status = status.Length == 0 ? null : status, Note = note });
    }
}

/// <summary>
/// One day of one class on the grid. Source: "confirmation" (On-site or Virtual, read-only),
/// "marked" (picked by staff) or null (nothing recorded; Suggestion may hold a likely reason).
/// </summary>
public record StatusCell(
    DateOnly Date, bool Meets, string? Status, string? Source, string? Note, string? Suggestion, bool AwaitingFinal, bool MakeUp = false);
