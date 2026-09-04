using LabTrack.Api.Data;
using LabTrack.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class CreateCourseSectionDto
{
    public int SubjectId { get; set; }
    public string SectionCode { get; set; } = string.Empty;
    public string? InstructorName { get; set; }
    public int AyId { get; set; }
}

public class UpdateInstructorDto
{
    public string? InstructorName { get; set; }
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CourseSectionsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public CourseSectionsController(ApplicationDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? ayId, [FromQuery] bool? pendingInstructorOnly)
    {
        var query = _db.CourseSections
            .Include(c => c.Subject)
            .Include(c => c.AcademicYear)
            .AsQueryable();

        if (ayId.HasValue) query = query.Where(c => c.AyId == ayId.Value);
        if (pendingInstructorOnly == true) query = query.Where(c => c.InstructorName == null);

        var sections = await query.ToListAsync();

        var progressBySection = await _db.ChedComplianceProgresses
            .Where(p => sections.Select(s => s.SectionId).Contains(p.SectionId))
            .ToDictionaryAsync(p => p.SectionId);

        return Ok(sections.Select(c => new
        {
            c.SectionId,
            c.SectionCode,
            Subject = new { c.Subject.SubjectId, c.Subject.Code, c.Subject.Title },
            AcademicYear = c.AcademicYear.Label,
            c.InstructorName,
            c.HasInstructorAssigned,
            Compliance = progressBySection.TryGetValue(c.SectionId, out var p)
                ? new { p.ConfirmedHoursTotal, p.RequiredHours, Status = p.Status.ToString() }
                : null
        }));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var section = await _db.CourseSections
            .Include(c => c.Subject)
            .Include(c => c.AcademicYear)
            .Include(c => c.SessionConfirmations).ThenInclude(sc => sc.ConfirmedByUser)
            .FirstOrDefaultAsync(c => c.SectionId == id);

        if (section is null) return NotFound();

        var progress = await _db.ChedComplianceProgresses.FirstOrDefaultAsync(p => p.SectionId == id);

        return Ok(new
        {
            section.SectionId,
            section.SectionCode,
            Subject = new { section.Subject.SubjectId, section.Subject.Code, section.Subject.Title, section.Subject.RequiredHours, section.Subject.TermWeeks },
            AcademicYear = new { section.AcademicYear.Label, section.AcademicYear.StartDate, section.AcademicYear.EndDate },
            section.InstructorName,
            section.HasInstructorAssigned,
            Compliance = progress is null ? null : new
            {
                progress.ConfirmedHoursTotal,
                progress.RequiredHours,
                Status = progress.Status.ToString(),
                progress.UpdatedAt
            },
            SessionConfirmations = section.SessionConfirmations
                .OrderByDescending(sc => sc.SessionDate)
                .Select(sc => new
                {
                    sc.ConfirmationId,
                    sc.SessionDate,
                    ConfirmedBy = sc.ConfirmedByUser.FullName,
                    sc.HoursCredited,
                    sc.Notes
                })
        });
    }

    /// <summary>
    /// Creates a Course Section and automatically creates its corresponding CHED Compliance
    /// Progress row (one-to-one), seeded from the Subject's RequiredHours. InstructorName may be
    /// left null — faculty assignment is often finalized after sections already exist.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Administrator")]
    public async Task<IActionResult> Create(CreateCourseSectionDto dto)
    {
        var subject = await _db.Subjects.FindAsync(dto.SubjectId);
        if (subject is null) return BadRequest("SubjectId does not exist.");

        var ayExists = await _db.AcademicYears.AnyAsync(a => a.AyId == dto.AyId);
        if (!ayExists) return BadRequest("AyId does not exist.");

        if (await _db.CourseSections.AnyAsync(c => c.SectionCode == dto.SectionCode))
            return BadRequest("A course section with this code already exists.");

        var section = new CourseSection
        {
            SubjectId = dto.SubjectId,
            SectionCode = dto.SectionCode,
            InstructorName = dto.InstructorName,
            AyId = dto.AyId
        };
        _db.CourseSections.Add(section);
        await _db.SaveChangesAsync(); // save first so section.SectionId is generated

        var progress = new ChedComplianceProgress
        {
            SectionId = section.SectionId,
            ConfirmedHoursTotal = 0m,
            RequiredHours = subject.RequiredHours,
            Status = ComplianceStatus.NonCompliant
        };
        progress.RecomputeStatus();
        _db.ChedComplianceProgresses.Add(progress);

        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = section.SectionId }, new
        {
            section.SectionId,
            section.SectionCode,
            section.SubjectId,
            section.InstructorName,
            section.AyId
        });
    }

    /// <summary>Assigns or updates the instructor for a section once faculty assignment is finalized.</summary>
    [HttpPatch("{id:int}/instructor")]
    [Authorize(Roles = "Administrator")]
    public async Task<IActionResult> UpdateInstructor(int id, UpdateInstructorDto dto)
    {
        var section = await _db.CourseSections.FindAsync(id);
        if (section is null) return NotFound();

        section.InstructorName = dto.InstructorName;
        await _db.SaveChangesAsync();

        return Ok(new { section.SectionId, section.InstructorName, section.HasInstructorAssigned });
    }
}