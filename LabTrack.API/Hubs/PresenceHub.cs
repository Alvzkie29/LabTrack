using LabTrack.Api.Data;
using LabTrack.Api.Models;
using LabTrack.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Hubs;

public class HeartbeatDto
{
    public int AttendanceId { get; set; }
    public int KeystrokeCount { get; set; }
    public int MouseEventCount { get; set; }
    public int IdleSeconds { get; set; }
}

/// <summary>
/// Real-time channel for the per-workstation client to push heartbeat telemetry, and for the
/// lab blueprint UI (Custodian/Lab Assistant dashboards) to receive live PC status. Clients join
/// a lab group (e.g. "lab-3") to receive blueprint updates for that laboratory.
/// </summary>
[Authorize]
public class PresenceHub : Hub
{
    private readonly ApplicationDbContext _db;
    private readonly ActivityScoringService _scoring;

    public PresenceHub(ApplicationDbContext db, ActivityScoringService scoring)
    {
        _db = db;
        _scoring = scoring;
    }

    public async Task JoinLabGroup(int labId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"lab-{labId}");
    }

    public async Task LeaveLabGroup(int labId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"lab-{labId}");
    }

    /// <summary>
    /// Called periodically (e.g. every 15-30s) by the workstation client while a student is
    /// logged in. Updates the session's running ActivityScore, marks the workstation's live
    /// status, and broadcasts the change to everyone watching that lab's blueprint.
    /// </summary>
    public async Task SendHeartbeat(HeartbeatDto dto)
    {
        var attendance = await _db.AttendanceSessions
            .Include(a => a.Workstation)
            .Include(a => a.ActivityScore)
            .FirstOrDefaultAsync(a => a.AttendanceId == dto.AttendanceId);

        if (attendance is null || attendance.LogoutTime is not null) return;

        var score = attendance.ActivityScore;
        if (score is null)
        {
            score = new ActivityScore { AttendanceId = attendance.AttendanceId };
            _db.ActivityScores.Add(score);
        }

        _scoring.ApplyHeartbeat(score, new HeartbeatInput
        {
            KeystrokeCount = dto.KeystrokeCount,
            MouseEventCount = dto.MouseEventCount,
            IdleSeconds = dto.IdleSeconds
        });

        var workstation = attendance.Workstation;
        workstation.Status = score.PresenceStatus == PresenceStatus.Active
            ? WorkstationStatus.Active
            : WorkstationStatus.Idle;
        workstation.LastHeartbeat = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var payload = new
        {
            workstation.WorkstationId,
            workstation.SeatLabel,
            Status = workstation.Status.ToString(),
            workstation.LastHeartbeat,
            score.CompositeScore,
            PresenceStatus = score.PresenceStatus.ToString()
        };

        // Broadcast to anyone watching this lab's blueprint (Custodians/Lab Assistants)...
        await Clients.Group($"lab-{workstation.LabId}").SendAsync("WorkstationStatusChanged", payload);

        // ...and also echo directly back to the student's own tab, which never joins a lab
        // group — without this, the sender would never see their own live score update.
        await Clients.Caller.SendAsync("WorkstationStatusChanged", payload);
    }
}