using LabTrack.Api.Data;
using LabTrack.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class CreateCourseSectionDto
{
    public int SubjectId { get; set; }
    public string SectionCode { get; set; } = string.Empty;
    public int LabId { get; set; }
    public string? FacultyId { get; set; }
    public string DayOfWeek { get; set; } = string.Empty; // e.g. "Monday"
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public int AyId { get; set; }
}

public class UpdateFacultyDto
{
    public string? FacultyId { get; set; }
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CourseSectionsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;

    public CourseSectionsController(ApplicationDbContext db, UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int? ayId, [FromQuery] int? labId, [FromQuery] bool? pendingFacultyOnly)
    {
        var query = _db.CourseSections
            .Include(c => c.Subject)
            .Include(c => c.AcademicYear)
            .Include(c => c.Laboratory)
            .Include(c => c.Faculty)
            .AsQueryable();

        if (ayId.HasValue) query = query.Where(c => c.AyId == ayId.Value);
        if (labId.HasValue) query = query.Where(c => c.LabId == labId.Value);
        if (pendingFacultyOnly == true) query = query.Where(c => c.FacultyId == null);

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
            Laboratory = new { c.Laboratory.LabId, c.Laboratory.Name, c.Laboratory.RoomCode },
            c.FacultyId,
            Faculty = c.Faculty?.FullName,
            c.HasInstructorAssigned,
            c.DayOfWeek,
            c.StartTime,
            c.EndTime,
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
            .Include(c => c.Laboratory)
            .Include(c => c.Faculty)
            .Include(c => c.SessionConfirmations).ThenInclude(sc => sc.FacultyConfirmedByUser)
            .Include(c => c.SessionConfirmations).ThenInclude(sc => sc.FinalConfirmedByUser)
            .FirstOrDefaultAsync(c => c.SectionId == id);

        if (section is null) return NotFound();

        var progress = await _db.ChedComplianceProgresses.FirstOrDefaultAsync(p => p.SectionId == id);

        return Ok(new
        {
            section.SectionId,
            section.SectionCode,
            Subject = new { section.Subject.SubjectId, section.Subject.Code, section.Subject.Title, section.Subject.RequiredHours, section.Subject.TermWeeks },
            AcademicYear = new { section.AcademicYear.Label, section.AcademicYear.StartDate, section.AcademicYear.EndDate },
            Laboratory = new { section.Laboratory.LabId, section.Laboratory.Name, section.Laboratory.RoomCode },
            section.FacultyId,
            Faculty = section.Faculty?.FullName,
            section.HasInstructorAssigned,
            section.DayOfWeek,
            section.StartTime,
            section.EndTime,
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
                    SessionType = sc.SessionType.ToString(),
                    sc.SessionDate,
                    FacultyConfirmedBy = sc.FacultyConfirmedByUser?.FullName,
                    sc.FacultyConfirmedAt,
                    FinalConfirmedBy = sc.FinalConfirmedByUser?.FullName,
                    sc.FinalConfirmedAt,
                    sc.HoursCredited,
                    sc.Notes
                })
        });
    }

    /// <summary>
    /// Creates a Course Section with its lab and schedule (the Custodian's semester schedule
    /// assignment) and its CHED Compliance Progress row. FacultyId may be left null.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Custodian,Administrator")]
    public async Task<IActionResult> Create(CreateCourseSectionDto dto)
    {
        var subject = await _db.Subjects.FindAsync(dto.SubjectId);
        if (subject is null) return BadRequest("SubjectId does not exist.");

        if (!await _db.AcademicYears.AnyAsync(a => a.AyId == dto.AyId))
            return BadRequest("AyId does not exist.");

        if (!await _db.Laboratories.AnyAsync(l => l.LabId == dto.LabId))
            return BadRequest("LabId does not exist.");

        if (!Enum.TryParse<DayOfWeek>(dto.DayOfWeek, true, out var day))
            return BadRequest("DayOfWeek must be a day name such as 'Monday'.");

        if (dto.EndTime <= dto.StartTime)
            return BadRequest("EndTime must be later than StartTime.");

        if (await _db.CourseSections.AnyAsync(c => c.SectionCode == dto.SectionCode))
            return BadRequest("A course section with this code already exists.");

        if (dto.FacultyId is not null)
        {
            var error = await ValidateFacultyAsync(dto.FacultyId);
            if (error is not null) return BadRequest(error);
        }

        var section = new CourseSection
        {
            SubjectId = dto.SubjectId,
            SectionCode = dto.SectionCode,
            LabId = dto.LabId,
            FacultyId = dto.FacultyId,
            DayOfWeek = day.ToString(),
            StartTime = dto.StartTime,
            EndTime = dto.EndTime,
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
            section.LabId,
            section.FacultyId,
            section.DayOfWeek,
            section.StartTime,
            section.EndTime,
            section.AyId
        });
    }

    /// <summary>Assigns, changes, or clears (null) the faculty member for a section.</summary>
    [HttpPatch("{id:int}/faculty")]
    [Authorize(Roles = "Custodian,Administrator")]
    public async Task<IActionResult> UpdateFaculty(int id, UpdateFacultyDto dto)
    {
        var section = await _db.CourseSections.FindAsync(id);
        if (section is null) return NotFound();

        if (dto.FacultyId is not null)
        {
            var error = await ValidateFacultyAsync(dto.FacultyId);
            if (error is not null) return BadRequest(error);
        }

        section.FacultyId = dto.FacultyId;
        await _db.SaveChangesAsync();

        return Ok(new { section.SectionId, section.FacultyId, section.HasInstructorAssigned });
    }

    private async Task<string?> ValidateFacultyAsync(string facultyId)
    {
        var user = await _userManager.FindByIdAsync(facultyId);
        if (user is null || !user.IsActive || !await _userManager.IsInRoleAsync(user, "Faculty"))
            return "FacultyId must belong to an active user with the Faculty role.";
        return null;
    }
}