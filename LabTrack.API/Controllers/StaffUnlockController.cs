using System.Security.Claims;
using LabTrack.Api.Data;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

public class StaffUnlockDto
{
    public string PcIdentifier { get; set; } = string.Empty;
}

/// <summary>
/// Lets staff unlock a laboratory PC for maintenance from the PC Agent. No attendance is
/// recorded; the unlock is written to the audit log with the staff account and the PC.
/// </summary>
[ApiController]
[Route("api/agent")]
[Authorize(Roles = "LabAssistant,Custodian,Administrator")]
public class StaffUnlockController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public StaffUnlockController(ApplicationDbContext db) => _db = db;

    [HttpPost("staff-unlock")]
    public async Task<IActionResult> StaffUnlock(StaffUnlockDto dto)
    {
        var userId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId is null) return Unauthorized();

        var workstation = await _db.Workstations
            .FirstOrDefaultAsync(w => w.PcIdentifier == dto.PcIdentifier);
        if (workstation is null) return NotFound("This workstation is not registered in LabTrack.");

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Action = "WorkstationStaffUnlocked",
            EntityType = nameof(Workstation),
            EntityId = workstation.WorkstationId.ToString(),
            Details = $"PcIdentifier={workstation.PcIdentifier}",
            IpAddress = this.CallerIp(),
        });
        await _db.SaveChangesAsync();

        return Ok(new { message = "Unlocked for maintenance." });
    }
}