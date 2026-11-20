using System.Globalization;
using System.Security.Claims;
using System.Text.RegularExpressions;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class SaveAcademicYearDto
{
    /// <summary>The school year, e.g. "2026-2027".</summary>
    public string Label { get; set; } = string.Empty;
    /// <summary>"FirstSemester", "SecondSemester" or "Summer".</summary>
    public string TermType { get; set; } = string.Empty;
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    /// <summary>The first day of the 2nd term. Not used for Summer.</summary>
    public DateOnly? SecondTermStart { get; set; }
}

/// <summary>
/// The semesters. Each semester has its own classes, sessions and reports, so a new school year
/// starts clean. Only one semester is active at a time; the pages open on it.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AcademicYearsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public AcademicYearsController(ApplicationDbContext db) => _db = db;

    /// <summary>The semesters, newest first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var years = await _db.AcademicYears
            .OrderByDescending(a => a.StartDate)
            .Select(a => new
            {
                a.AyId,
                a.Label,
                a.TermType,
                a.StartDate,
                a.EndDate,
                a.SecondTermStart,
                a.IsActive,
                Classes = a.CourseSections.Count()
            })
            .ToListAsync();

        // The enum is named here, after the query: inside it, SQL turns it into "0", "1", "2".
        return Ok(years.Select(a => new
        {
            a.AyId,
            a.Label,
            TermType = a.TermType.ToString(),
            a.StartDate,
            a.EndDate,
            a.SecondTermStart,
            a.IsActive,
            a.Classes
        }));
    }

    [HttpPost]
    [Authorize(Roles = "Custodian,Administrator")]
    public async Task<IActionResult> Create([FromBody] SaveAcademicYearDto dto)
    {
        var (problem, term) = Validate(dto);
        if (problem is not null) return BadRequest(new { message = problem });
        var label = dto.Label.Trim();
        if (await _db.AcademicYears.AnyAsync(a => a.Label == label && a.TermType == term))
            return Conflict(new { message = $"{Describe(term)} {label} already exists." });

        var ay = new AcademicYear
        {
            Label = label,
            TermType = term,
            StartDate = dto.StartDate.ToDateTime(TimeOnly.MinValue),
            EndDate = dto.EndDate.ToDateTime(TimeOnly.MinValue),
            SecondTermStart = term == TermType.Summer ? null : dto.SecondTermStart?.ToDateTime(TimeOnly.MinValue),
            // The very first semester becomes active by itself.
            IsActive = !await _db.AcademicYears.AnyAsync(),
        };
        _db.AcademicYears.Add(ay);
        await _db.SaveChangesAsync();
        await Audit("AcademicYearCreated", ay, $"{Describe(term)} {label}, {dto.StartDate:yyyy-MM-dd} to {dto.EndDate:yyyy-MM-dd}");
        return Ok(new { ay.AyId });
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Custodian,Administrator")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveAcademicYearDto dto)
    {
        var ay = await _db.AcademicYears.FindAsync(id);
        if (ay is null) return NotFound(new { message = "Semester not found." });
        var (problem, term) = Validate(dto);
        if (problem is not null) return BadRequest(new { message = problem });
        var label = dto.Label.Trim();
        if (await _db.AcademicYears.AnyAsync(a => a.AyId != id && a.Label == label && a.TermType == term))
            return Conflict(new { message = $"{Describe(term)} {label} already exists." });

        ay.Label = label;
        ay.TermType = term;
        ay.StartDate = dto.StartDate.ToDateTime(TimeOnly.MinValue);
        ay.EndDate = dto.EndDate.ToDateTime(TimeOnly.MinValue);
        ay.SecondTermStart = term == TermType.Summer ? null : dto.SecondTermStart?.ToDateTime(TimeOnly.MinValue);
        await _db.SaveChangesAsync();
        await Audit("AcademicYearUpdated", ay,
            $"{Describe(term)} {label}, {dto.StartDate:yyyy-MM-dd} to {dto.EndDate:yyyy-MM-dd}, 2nd term {dto.SecondTermStart:yyyy-MM-dd}");
        return NoContent();
    }

    /// <summary>Makes this the active semester; the one before it stops being active.</summary>
    [HttpPost("{id:int}/activate")]
    [Authorize(Roles = "Custodian,Administrator")]
    public async Task<IActionResult> Activate(int id)
    {
        var all = await _db.AcademicYears.ToListAsync();
        var ay = all.FirstOrDefault(a => a.AyId == id);
        if (ay is null) return NotFound(new { message = "Semester not found." });
        foreach (var a in all) a.IsActive = a.AyId == id;
        await _db.SaveChangesAsync();
        await Audit("AcademicYearActivated", ay, $"{Describe(ay.TermType)} {ay.Label}");
        return NoContent();
    }

    /// <summary>Only a semester with no classes can be deleted, so no records are lost.</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Custodian,Administrator")]
    public async Task<IActionResult> Delete(int id)
    {
        var ay = await _db.AcademicYears.FindAsync(id);
        if (ay is null) return NotFound(new { message = "Semester not found." });
        if (await _db.CourseSections.AnyAsync(c => c.AyId == id))
            return Conflict(new { message = "This semester has classes, so it can't be deleted." });
        if (ay.IsActive) return Conflict(new { message = "Make another semester active before deleting this one." });
        _db.AcademicYears.Remove(ay);
        await _db.SaveChangesAsync();
        await Audit("AcademicYearDeleted", ay, $"{Describe(ay.TermType)} {ay.Label}");
        return NoContent();
    }

    private static string Describe(TermType t) => t switch
    {
        TermType.FirstSemester => "1st Semester",
        TermType.SecondSemester => "2nd Semester",
        _ => "Summer",
    };

    private static (string? Problem, TermType Term) Validate(SaveAcademicYearDto dto)
    {
        if (!Enum.TryParse<TermType>(dto.TermType, out var term) || !Enum.IsDefined(term))
            return ("Pick 1st Semester, 2nd Semester or Summer.", default);

        var m = Regex.Match(dto.Label?.Trim() ?? "", @"^(\d{4})-(\d{4})$");
        if (!m.Success || int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture) != int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) + 1)
            return ("Write the school year like 2026-2027.", term);

        if (dto.EndDate <= dto.StartDate) return ("The end date must be after the start date.", term);
        if (dto.EndDate.DayNumber - dto.StartDate.DayNumber > 200) return ("A semester can't be longer than about 6 months. Check the dates.", term);

        if (term != TermType.Summer)
        {
            if (dto.SecondTermStart is null) return ("Enter the day the 2nd term starts.", term);
            if (dto.SecondTermStart <= dto.StartDate || dto.SecondTermStart > dto.EndDate)
                return ("The 2nd term must start between the semester's start and end dates.", term);
        }
        return (null, term);
    }

    private async Task Audit(string action, AcademicYear ay, string details)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value,
            Action = action,
            EntityType = nameof(AcademicYear),
            EntityId = ay.AyId.ToString(CultureInfo.InvariantCulture),
            Details = details,
            IpAddress = this.CallerIp(),
        });
        await _db.SaveChangesAsync();
    }
}
