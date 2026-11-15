using LabTrack.Api.Data;
using LabTrack.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class CreateAcademicYearDto
{
    public string Label { get; set; } = string.Empty;
    public TermType TermType { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AcademicYearsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public AcademicYearsController(ApplicationDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _db.AcademicYears.ToListAsync());

    [HttpGet("active")]
    public async Task<IActionResult> GetActive()
    {
        var active = await _db.AcademicYears.FirstOrDefaultAsync(a => a.IsActive);
        return active is null ? NotFound("No active academic year is set.") : Ok(active);
    }

    [HttpPost]
    [Authorize(Roles = "Administrator")]
    public async Task<IActionResult> Create(CreateAcademicYearDto dto)
    {
        var ay = new AcademicYear
        {
            Label = dto.Label,
            TermType = dto.TermType,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate
        };

        _db.AcademicYears.Add(ay);
        await _db.SaveChangesAsync();
        return Ok(new { ay.AyId, ay.Label, ay.TermType, ay.StartDate, ay.EndDate, ay.IsActive });
    }

    /// <summary>Marks this academic year active and deactivates all others (only one active term at a time).</summary>
    [HttpPost("{id:int}/activate")]
    [Authorize(Roles = "Administrator")]
    public async Task<IActionResult> Activate(int id)
    {
        var target = await _db.AcademicYears.FindAsync(id);
        if (target is null) return NotFound();

        var currentlyActive = await _db.AcademicYears.Where(a => a.IsActive).ToListAsync();
        foreach (var ay in currentlyActive) ay.IsActive = false;

        target.IsActive = true;
        await _db.SaveChangesAsync();

        return Ok(new { target.AyId, target.Label, target.IsActive });
    }
    /// <summary>
    /// One row per class day with at least one login: how many rostered students were present,
    /// the class list size, the active PCs in the lab(s) the class met in that day, and whether
    /// that day's session has been finally confirmed (with the hours credited).
    /// </summary>
    [HttpGet("by-section/{sectionId:int}/history")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> GetHistory(int sectionId)
    {
        // Philippine time is UTC+8; login times are stored in UTC.
        const int utcOffsetHours = 8;

        var rosterIds = (await _db.SectionEnrollments
            .Where(e => e.SectionId == sectionId)
            .Select(e => e.StudentId)
            .ToListAsync()).ToHashSet();

        var logins = await _db.AttendanceSessions
            .Where(a => a.SectionId == sectionId)
            .Select(a => new { a.StudentId, a.LoginTime })
            .ToListAsync();

        var meetings = await _db.SectionSchedules
            .Where(m => m.SectionId == sectionId)
            .Select(m => new { m.DayOfWeek, m.LabId })
            .ToListAsync();

        var activePcsByLab = await _db.Workstations
            .Where(w => w.IsActive)
            .GroupBy(w => w.LabId)
            .Select(g => new { LabId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.LabId, x => x.Count);

        var confirmations = await _db.SessionConfirmations
            .Where(sc => sc.SectionId == sectionId && sc.FinalConfirmedAt != null)
            .Select(sc => new { sc.SessionDate, sc.HoursCredited })
            .ToListAsync();

        var days = logins
            .GroupBy(l => DateOnly.FromDateTime(l.LoginTime.AddHours(utcOffsetHours)))
            .OrderByDescending(g => g.Key)
            .Select(g =>
            {
                var weekday = g.Key.DayOfWeek.ToString();
                var pcs = meetings
                    .Where(m => m.DayOfWeek == weekday)
                    .Select(m => m.LabId)
                    .Distinct()
                    .Sum(labId => activePcsByLab.GetValueOrDefault(labId));

                var confirmed = confirmations
                    .Where(c => DateOnly.FromDateTime(c.SessionDate) == g.Key)
                    .ToList();

                return new
                {
                    Date = g.Key,
                    PresentCount = g.Select(x => x.StudentId).Distinct().Count(x => rosterIds.Contains(x)),
                    RosterCount = rosterIds.Count,
                    Workstations = pcs,
                    Confirmed = confirmed.Count > 0,
                    HoursCredited = confirmed.Count > 0 ? (decimal?)confirmed.Sum(c => c.HoursCredited) : null
                };
            })
            .ToList();

        return Ok(days);
    }
}