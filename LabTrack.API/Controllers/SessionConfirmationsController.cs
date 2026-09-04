using System.Security.Claims;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class CreateSessionConfirmationDto
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
    public SessionConfirmationsController(ApplicationDbContext db) => _db = db;

    [HttpGet("by-section/{sectionId:int}")]
    public async Task<IActionResult> GetBySection(int sectionId)
    {
        var confirmations = await _db.SessionConfirmations
            .Where(sc => sc.SectionId == sectionId)
            .Include(sc => sc.ConfirmedByUser)
            .OrderByDescending(sc => sc.SessionDate)
            .Select(sc => new
            {
                sc.ConfirmationId,
                sc.SessionDate,
                ConfirmedBy = sc.ConfirmedByUser.FullName,
                sc.HoursCredited,
                sc.Notes,
                sc.CreatedAt
            })
            .ToListAsync();

        return Ok(confirmations);
    }

    /// <summary>
    /// The core "session trustworthiness" action: a Lab Assistant or Custodian confirms that a
    /// class session took place. This IS the CHED-hour crediting step — creating this row
    /// immediately updates the section's ChedComplianceProgress, independent of and not gated by
    /// individual student workstation activity. Also writes an AuditLog entry, and generates a
    /// RemedialRecommendation if the section falls into AtRisk/NonCompliant after crediting.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> Confirm(CreateSessionConfirmationDto dto)
    {
        var section = await _db.CourseSections.FindAsync(dto.SectionId);
        if (section is null) return BadRequest("SectionId does not exist.");

        if (dto.HoursCredited <= 0)
            return BadRequest("HoursCredited must be greater than zero.");

        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId is null) return Unauthorized();

        var confirmation = new SessionConfirmation
        {
            SectionId = dto.SectionId,
            ConfirmedBy = userId,
            SessionDate = dto.SessionDate,
            HoursCredited = dto.HoursCredited,
            Notes = dto.Notes
        };
        _db.SessionConfirmations.Add(confirmation);

        // Update (or create, defensively) the section's CHED compliance rollup.
        var progress = await _db.ChedComplianceProgresses.FirstOrDefaultAsync(p => p.SectionId == dto.SectionId);
        if (progress is null)
        {
            progress = new ChedComplianceProgress
            {
                SectionId = dto.SectionId,
                RequiredHours = (await _db.Subjects.FindAsync(section.SubjectId))?.RequiredHours ?? 0m
            };
            _db.ChedComplianceProgresses.Add(progress);
        }

        progress.ConfirmedHoursTotal += dto.HoursCredited;
        progress.RecomputeStatus();
        progress.UpdatedAt = DateTime.UtcNow;

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Action = "SessionConfirmed",
            EntityType = nameof(SessionConfirmation),
            EntityId = confirmation.ConfirmationId.ToString(),
            Details = $"SectionId={dto.SectionId}, HoursCredited={dto.HoursCredited}, SessionDate={dto.SessionDate:yyyy-MM-dd}"
        });

        // Auto-generate a remedial recommendation when the section is behind after this confirmation.
        if (progress.Status != ComplianceStatus.Compliant)
        {
            var deficit = progress.RequiredHours - progress.ConfirmedHoursTotal;
            if (deficit > 0)
            {
                // Estimate sessions needed using this confirmation's hour value as the typical rate.
                var sessionsNeeded = (int)Math.Ceiling(deficit / dto.HoursCredited);

                _db.RemedialRecommendations.Add(new RemedialRecommendation
                {
                    SectionId = dto.SectionId,
                    HourDeficit = deficit,
                    AdditionalSessionsNeeded = sessionsNeeded
                });
            }
        }

        await _db.SaveChangesAsync();

        return Ok(new
        {
            confirmation.ConfirmationId,
            confirmation.SessionDate,
            confirmation.HoursCredited,
            Compliance = new
            {
                progress.ConfirmedHoursTotal,
                progress.RequiredHours,
                Status = progress.Status.ToString()
            }
        });
    }
}