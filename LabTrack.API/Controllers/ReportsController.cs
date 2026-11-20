using System.Globalization;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

/// <summary>
/// The weekly laboratory report, in the shape of the Laboratory Management Office's template:
/// one report per laboratory per week (Monday to Saturday), one row per class, with the hours
/// credited before this week (Previous), during it (Current), and the running total (Sub Total).
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "LabAssistant,Custodian,Administrator")]
public class ReportsController : ControllerBase
{
    private const int UtcOffsetHours = 8; // Philippine time

    private readonly ApplicationDbContext _db;
    public ReportsController(ApplicationDbContext db) => _db = db;

    /// <summary>Monday = 0 ... Saturday = 5, Sunday = 6.</summary>
    private static int DayIndex(DayOfWeek day) => ((int)day + 6) % 7;

    private static DateOnly MondayOf(DateOnly date) => date.AddDays(-DayIndex(date.DayOfWeek));

    /// <summary>
    /// The laboratory a session of this class counts toward: the lab of a make-up class held that
    /// day, otherwise the lab of the class's meeting on that weekday. A session on a day the class
    /// does not normally meet (a virtual session, say) counts toward the lab of the class's first
    /// meeting of the week.
    /// </summary>
    private static int LabOf(CourseSection section, DateOnly date, IEnumerable<MakeUpClass> makeUps)
    {
        var makeUp = makeUps.FirstOrDefault(m => m.SectionId == section.SectionId && m.Date == date);
        if (makeUp is not null) return makeUp.LabId;
        var weekday = date.DayOfWeek.ToString();
        var meeting = section.Schedules.FirstOrDefault(m => m.DayOfWeek == weekday)
            ?? section.Schedules
                .OrderBy(m => DayIndex(Enum.Parse<DayOfWeek>(m.DayOfWeek)))
                .ThenBy(m => m.StartTime)
                .First();
        return meeting.LabId;
    }

    /// <summary>
    /// The weekly report for one laboratory. weekStart may be any date in the week; it is moved
    /// back to that week's Monday. Without it, the current week is used.
    /// </summary>
    [HttpGet("weekly")]
    public async Task<IActionResult> Weekly([FromQuery] int labId, [FromQuery] int ayId, [FromQuery] DateOnly? weekStart)
    {
        var lab = await _db.Laboratories.FindAsync(labId);
        if (lab is null) return NotFound("Laboratory not found.");

        var ay = await _db.AcademicYears.FindAsync(ayId);
        if (ay is null) return NotFound("Academic year not found.");

        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(UtcOffsetHours));
        var monday = MondayOf(weekStart ?? today);
        var saturday = monday.AddDays(5);

        // Weeks are counted per term, as on the office's sheets: week 1 is the week the semester
        // starts in, and again the week the 2nd term starts in.
        var secondTerm = ay.SecondTermStart is null ? (DateOnly?)null : MondayOf(DateOnly.FromDateTime(ay.SecondTermStart.Value));
        var inSecondTerm = secondTerm is not null && monday >= secondTerm;
        var termMonday = inSecondTerm ? secondTerm!.Value : MondayOf(DateOnly.FromDateTime(ay.StartDate));
        var weekNumber = (monday.DayNumber - termMonday.DayNumber) / 7 + 1;
        var termName = ay.TermType == TermType.Summer ? "Summer" : inSecondTerm ? "2nd Term" : "1st Term";

        var sections = await _db.CourseSections
            .Include(c => c.Subject)
            .Include(c => c.Faculty)
            .Include(c => c.Schedules)
            .Include(c => c.AcademicYear)
            .Where(c => c.AyId == ayId && (c.Schedules.Any(m => m.LabId == labId) || c.MakeUpClasses.Any(m => m.LabId == labId)))
            .ToListAsync();
        var sectionIds = sections.Select(s => s.SectionId).ToList();

        // All make-up classes of these classes: a session on a make-up date counts toward the make-up's lab.
        var makeUps = await _db.MakeUpClasses.Where(m => sectionIds.Contains(m.SectionId)).ToListAsync();

        var confirmations = await _db.SessionConfirmations
            .Where(sc => sectionIds.Contains(sc.SectionId))
            .Select(sc => new { sc.SectionId, sc.SessionDate, sc.HoursCredited, sc.FacultyConfirmedAt, sc.FinalConfirmedAt })
            .ToListAsync();

        // What staff marked on the class status grid for meetings without a confirmed session.
        var marks = await _db.SessionStatuses
            .Where(m => sectionIds.Contains(m.SectionId) && m.SessionDate >= monday && m.SessionDate <= saturday)
            .Select(m => new { m.SectionId, m.SessionDate, m.Status, m.Note })
            .ToListAsync();

        var rows = sections
            .OrderBy(s => s.SectionCode, StringComparer.Ordinal)
            .Select(s =>
            {
                // This class's sessions that count toward this laboratory.
                var sessions = confirmations
                    .Where(c => c.SectionId == s.SectionId)
                    .Select(c => new
                    {
                        Date = DateOnly.FromDateTime(c.SessionDate),
                        c.HoursCredited,
                        Final = c.FinalConfirmedAt != null,
                        FacultyConfirmed = c.FacultyConfirmedAt != null
                    })
                    .Where(c => LabOf(s, c.Date, makeUps) == labId)
                    .ToList();

                // Only finally confirmed sessions carry hours.
                var previous = sessions.Where(c => c.Final && c.Date < monday).Sum(c => c.HoursCredited);
                var current = sessions.Where(c => c.Final && c.Date >= monday && c.Date <= saturday).Sum(c => c.HoursCredited);

                // "Completed" when every meeting this week in this lab was held; otherwise each
                // date that was not, with the status marked on the class status grid, as in
                // "11/11/26 No Students and Teacher Around". Meetings from today on are not
                // counted as missed yet.
                // Regular meetings count only in the class's own term (1st or 2nd term).
                var weekMakeUps = makeUps
                    .Where(m => m.SectionId == s.SectionId && m.LabId == labId && m.Date >= monday && m.Date <= saturday)
                    .ToList();
                var meetingDates = s.Schedules
                    .Where(m => m.LabId == labId)
                    .Select(m => monday.AddDays(DayIndex(Enum.Parse<DayOfWeek>(m.DayOfWeek))))
                    .Where(d => d <= saturday && s.RunsOn(d))
                    .Concat(weekMakeUps.Select(m => m.Date))
                    .Distinct()
                    .OrderBy(d => d)
                    .ToList();

                // A class outside its term this week, with nothing held here, is left off the report.
                if (meetingDates.Count == 0 && current == 0) return null;

                var notes = new List<string>();
                var stillToCome = false;
                foreach (var date in meetingDates)
                {
                    var onThatDay = sessions.Where(c => c.Date == date).ToList();
                    if (onThatDay.Any(c => c.Final)) continue;

                    var label = date.ToString("MM/dd/yy", CultureInfo.InvariantCulture);
                    if (weekMakeUps.Any(m => m.Date == date)) label += " make-up class";
                    var mark = marks.FirstOrDefault(m => m.SectionId == s.SectionId && m.SessionDate == date);
                    if (onThatDay.Any(c => c.FacultyConfirmed))
                        notes.Add($"{label} awaiting final confirmation");
                    else if (mark is not null)
                        notes.Add(mark.Note is null ? $"{label} {mark.Status}" : $"{label} {mark.Status}: {mark.Note}");
                    else if (date >= today)
                        stillToCome = true;
                    else
                        notes.Add($"{label} not marked");
                }

                // A semestral subject is written "Completed (Semester)", as the office does, so a
                // Previous above 27 is not mistaken for a term subject going over.
                var remarks = notes.Count > 0
                    ? string.Join("; ", notes)
                    : stillToCome ? string.Empty
                    : s.Subject.TermWeeks >= 18 ? "Completed (Semester)" : "Completed";

                // A make-up class that was held is written after the remarks, as in "Completed; 11/14/26 make-up class held".
                var heldMakeUps = weekMakeUps
                    .Where(m => sessions.Any(c => c.Final && c.Date == m.Date))
                    .Select(m => $"{m.Date.ToString("MM/dd/yy", CultureInfo.InvariantCulture)} make-up class held")
                    .ToList();
                if (heldMakeUps.Count > 0)
                    remarks = string.Join("; ", new[] { remarks }.Where(r => r.Length > 0).Concat(heldMakeUps));

                return new
                {
                    s.SectionId,
                    s.SectionCode,
                    SubjectCode = s.Subject.Code,
                    SubjectTitle = s.Subject.Title,
                    Faculty = s.Faculty?.FullName,
                    PreviousHours = previous,
                    CurrentHours = current,
                    SubTotal = previous + current,
                    Remarks = remarks
                };
            })
            .Where(r => r is not null)
            .ToList();

        return Ok(new
        {
            AcademicYear = new { ay.AyId, ay.Label, TermType = ay.TermType.ToString(), ay.StartDate, ay.EndDate, ay.SecondTermStart },
            Term = termName,
            Laboratory = new { lab.LabId, lab.Name, lab.RoomCode },
            WeekNumber = weekNumber,
            WeekStart = monday,
            WeekEnd = saturday,
            Rows = rows
        });
    }
}
