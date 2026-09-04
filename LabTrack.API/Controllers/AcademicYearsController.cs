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
}