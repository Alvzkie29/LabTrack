using LabTrack.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Controllers;

/// <summary>
/// Read-only. ActivityScore rows are written exclusively by PresenceHub.SendHeartbeat (live,
/// via SignalR) and finalized on logout by AttendanceSessionsController — never created or
/// edited directly through a REST endpoint, since they must always reflect real telemetry.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ActivityScoresController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public ActivityScoresController(ApplicationDbContext db) => _db = db;

    [HttpGet("by-attendance/{attendanceId:int}")]
    public async Task<IActionResult> GetByAttendance(int attendanceId)
    {
        var score = await _db.ActivityScores.FirstOrDefaultAsync(a => a.AttendanceId == attendanceId);
        if (score is null) return NotFound("No activity data recorded yet for this session.");

        return Ok(new
        {
            score.ActivityId,
            score.AttendanceId,
            score.CompositeScore,
            PresenceStatus = score.PresenceStatus.ToString(),
            score.TotalHeartbeats,
            score.ActiveHeartbeats,
            score.ComputedAt
        });
    }

    /// <summary>Utilization overview for a lab over a date range — average scores per workstation.</summary>
    [HttpGet("lab-summary/{labId:int}")]
    [Authorize(Roles = "LabAssistant,Custodian,Administrator")]
    public async Task<IActionResult> GetLabSummary(int labId, [FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var fromDate = from ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to ?? DateTime.UtcNow;

        var summary = await _db.AttendanceSessions
            .Where(a => a.Workstation.LabId == labId && a.LoginTime >= fromDate && a.LoginTime <= toDate && a.ActivityScore != null)
            .GroupBy(a => new { a.WorkstationId, a.Workstation.SeatLabel })
            .Select(g => new
            {
                g.Key.WorkstationId,
                g.Key.SeatLabel,
                SessionCount = g.Count(),
                AverageScore = g.Average(a => a.ActivityScore!.CompositeScore),
                FlaggedCount = g.Count(a => a.ActivityScore!.PresenceStatus == Models.PresenceStatus.Flagged)
            })
            .ToListAsync();

        return Ok(summary);
    }
}