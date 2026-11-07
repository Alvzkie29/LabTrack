using System.Security.Claims;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class FacultyConfirmDto
{
    public int SectionId { get; set; }
    public DateTime SessionDate { get; set; }
    public string FacultyId { get; set; } = string.Empty;
    public string Pin { get; set; } = string.Empty;
}

public class FinalConfirmDto
{
    public string? Notes { get; set; }
}

public class CreateVirtualSessionDto
{
    public int SectionId { get; set; }
    public DateTime SessionDate { get; set; }
    public decimal HoursCredited { get; set; }
    public string? Notes { get; set; }
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SessionConfirmationsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly PasswordHasher<ApplicationUser> _hasher = new();

    public SessionConfirmationsController(ApplicationDbContext db, UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    [HttpGet("by-section/{sectionId:int}")]
    public async Task<IActionResult> GetBySection(int sectionId)
    {
        var confirmations = await _db.SessionConfirmations
            .Where(sc => sc.SectionId == sectionId)
            .OrderByDescending(sc => sc.SessionDate)
            .Select(sc => new
            {
                sc.ConfirmationId,
                SessionType = sc.SessionType.ToString(),
                sc.SessionDate,
                FacultyConfirmedBy = sc.FacultyConfirmedByUser != null ? sc.FacultyConfirmedByUser.FullName : null,
                sc.FacultyConfirmedAt,
                FinalConfirmedBy = sc.FinalConfirmedByUser != null ? sc.FinalConfirmedByUser.FullName : null,
                sc.FinalConfirmedAt,
                sc.HoursCredited,
                sc.Notes,
                sc.CreatedAt
            })
            .ToListAsync();

        return Ok(confirmations);
    }

    /// <summary>
    /// Faculty names for the confirmation dropdown. The section's assigned faculty member is listed
    /// first, but anyone can be picked (e.g. a substitute); who actually confirmed is recorded.
    /// Faculty without a PIN are left out because they could not confirm anyway.
    /// </summary>
    [HttpGet("faculty")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> GetFacultyOptions([FromQuery] int? sectionId)
    {
        string? assignedId = null;
        if (sectionId.HasValue)
        {
            assignedId = await _db.CourseSections
                .Where(s => s.SectionId == sectionId.Value)
                .Select(s => s.FacultyId)
                .FirstOrDefaultAsync();
        }

        var faculty = await _userManager.GetUsersInRoleAsync("Faculty");

        var options = faculty
            .Where(f => f.IsActive && !string.IsNullOrEmpty(f.PinHash))
            .OrderByDescending(f => f.Id == assignedId)
            .ThenBy(f => f.LastName)
            .ThenBy(f => f.FirstName)
            .Select(f => new { f.Id, f.FullName, f.SchoolId, IsAssigned = f.Id == assignedId });

        return Ok(options);
    }

    /// <summary>
    /// Step 1 (physical sessions): the Faculty member picks their name and enters their PIN.
    /// Creates the confirmation row; no hours are credited yet. Hours for the session are
    /// taken from the section's scheduled start and end time.
    /// </summary>
    [HttpPost("faculty-confirm")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> FacultyConfirm(FacultyConfirmDto dto)
    {
        var section = await _db.CourseSections.FindAsync(dto.SectionId);
        if (section is null) return BadRequest("SectionId does not exist.");

        var faculty = await _userManager.FindByIdAsync(dto.FacultyId);
        if (faculty is null
            || !faculty.IsActive
            || !await _userManager.IsInRoleAsync(faculty, "Faculty")
            || string.IsNullOrEmpty(faculty.PinHash))
        {
            return Unauthorized("Invalid faculty or PIN.");
        }

        if (await _userManager.IsLockedOutAsync(faculty))
        {
            var remaining = (faculty.LockoutEnd ?? DateTimeOffset.UtcNow) - DateTimeOffset.UtcNow;
            var minutes = Math.Max(1, (int)Math.Ceiling(remaining.TotalMinutes));
            return StatusCode(StatusCodes.Status423Locked,
                $"Too many wrong PIN attempts. Try again in about {minutes} minute(s).");
        }

        if (_hasher.VerifyHashedPassword(faculty, faculty.PinHash, dto.Pin) == PasswordVerificationResult.Failed)
        {
            await _userManager.AccessFailedAsync(faculty); // counts the failure and locks at the limit
            return Unauthorized("Invalid faculty or PIN.");
        }

        await _userManager.ResetAccessFailedCountAsync(faculty); // correct PIN clears the counter

        var date = dto.SessionDate.Date;
        var exists = await _db.SessionConfirmations.AnyAsync(sc =>
            sc.SectionId == dto.SectionId && sc.SessionDate == date && sc.SessionType == SessionType.Physical);
        if (exists) return BadRequest("This session already has a confirmation.");

        var staffId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        var confirmation = new SessionConfirmation
        {
            SectionId = dto.SectionId,
            SessionType = SessionType.Physical,
            SessionDate = date,
            FacultyConfirmedBy = faculty.Id,
            FacultyConfirmedAt = DateTime.UtcNow,
            HoursCredited = (decimal)(section.EndTime - section.StartTime).TotalHours
        };
        _db.SessionConfirmations.Add(confirmation);
        await _db.SaveChangesAsync(); // generates ConfirmationId

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = faculty.Id,
            Action = "SessionFacultyConfirmed",
            EntityType = nameof(SessionConfirmation),
            EntityId = confirmation.ConfirmationId.ToString(),
            Details = $"SectionId={dto.SectionId}, SessionDate={date:yyyy-MM-dd}, RecordedBy={staffId}"
        });
        await _db.SaveChangesAsync();

        return Ok(new { confirmation.ConfirmationId, confirmation.SessionDate, confirmation.HoursCredited });
    }

    /// <summary>
    /// Step 2: a Lab Assistant or Custodian gives final confirmation. This is the only step
    /// that credits CHED hours.
    /// </summary>
    [HttpPost("{id:int}/final-confirm")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> FinalConfirm(int id, FinalConfirmDto dto)
    {
        var confirmation = await _db.SessionConfirmations.FindAsync(id);
        if (confirmation is null) return NotFound();
        if (confirmation.IsFinalConfirmed) return BadRequest("This session is already finally confirmed.");

        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId is null) return Unauthorized();

        confirmation.FinalConfirmedBy = userId;
        confirmation.FinalConfirmedAt = DateTime.UtcNow;
        if (!string.IsNullOrWhiteSpace(dto.Notes)) confirmation.Notes = dto.Notes;

        var compliance = await CreditHoursAsync(confirmation, userId);

        return Ok(new { confirmation.ConfirmationId, confirmation.HoursCredited, Compliance = compliance });
    }

    /// <summary>
    /// Virtual sessions: entered by a Lab Assistant or Custodian without Faculty e-signature.
    /// Counts toward CHED hours immediately.
    /// </summary>
    [HttpPost("virtual")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> CreateVirtual(CreateVirtualSessionDto dto)
    {
        if (!await _db.CourseSections.AnyAsync(s => s.SectionId == dto.SectionId))
            return BadRequest("SectionId does not exist.");

        if (dto.HoursCredited <= 0)
            return BadRequest("HoursCredited must be greater than zero.");

        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId is null) return Unauthorized();

        var date = dto.SessionDate.Date;
        var exists = await _db.SessionConfirmations.AnyAsync(sc =>
            sc.SectionId == dto.SectionId && sc.SessionDate == date && sc.SessionType == SessionType.Virtual);
        if (exists) return BadRequest("A virtual session for this section and date already exists.");

        var confirmation = new SessionConfirmation
        {
            SectionId = dto.SectionId,
            SessionType = SessionType.Virtual,
            SessionDate = date,
            HoursCredited = dto.HoursCredited,
            FinalConfirmedBy = userId,
            FinalConfirmedAt = DateTime.UtcNow,
            Notes = dto.Notes
        };
        _db.SessionConfirmations.Add(confirmation);
        await _db.SaveChangesAsync(); // generates ConfirmationId

        var compliance = await CreditHoursAsync(confirmation, userId);

        return Ok(new { confirmation.ConfirmationId, confirmation.HoursCredited, Compliance = compliance });
    }

    /// <summary>
    /// Adds the confirmation's hours to the section's CHED rollup, writes the audit log entry,
    /// and creates a remedial recommendation if the section is still behind.
    /// </summary>
    private async Task<object> CreditHoursAsync(SessionConfirmation confirmation, string userId)
    {
        var progress = await _db.ChedComplianceProgresses
            .FirstOrDefaultAsync(p => p.SectionId == confirmation.SectionId);

        if (progress is null)
        {
            var section = await _db.CourseSections.Include(s => s.Subject)
                .FirstAsync(s => s.SectionId == confirmation.SectionId);
            progress = new ChedComplianceProgress
            {
                SectionId = confirmation.SectionId,
                RequiredHours = section.Subject.RequiredHours
            };
            _db.ChedComplianceProgresses.Add(progress);
        }

        progress.ConfirmedHoursTotal += confirmation.HoursCredited;
        progress.RecomputeStatus();
        progress.UpdatedAt = DateTime.UtcNow;

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Action = "SessionFinalConfirmed",
            EntityType = nameof(SessionConfirmation),
            EntityId = confirmation.ConfirmationId.ToString(),
            Details = $"SectionId={confirmation.SectionId}, Type={confirmation.SessionType}, HoursCredited={confirmation.HoursCredited}, SessionDate={confirmation.SessionDate:yyyy-MM-dd}"
        });

        if (progress.Status != ComplianceStatus.Compliant)
        {
            var deficit = progress.RequiredHours - progress.ConfirmedHoursTotal;
            if (deficit > 0)
            {
                var sessionsNeeded = (int)Math.Ceiling(deficit / confirmation.HoursCredited);

                _db.RemedialRecommendations.Add(new RemedialRecommendation
                {
                    SectionId = confirmation.SectionId,
                    HourDeficit = deficit,
                    AdditionalSessionsNeeded = sessionsNeeded
                });
            }
        }

        await _db.SaveChangesAsync();

        return new
        {
            progress.ConfirmedHoursTotal,
            progress.RequiredHours,
            Status = progress.Status.ToString()
        };
    }
}