using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LabTrack.Api.Models;

public enum PresenceStatus
{
    Active = 0,
    Idle = 1,
    Flagged = 2 // composite score below trust threshold — likely proxy login or abandoned session
}

/// <summary>
/// One row per AttendanceSession (one-to-one). Holds the current composite activity score
/// (Eqs. 1-6, section 2.2.2) derived from ongoing keystroke/mouse heartbeat telemetry, used for
/// proxy-login prevention and utilization metrics only. Never affects CHED-hour crediting —
/// that happens independently via SessionConfirmation.
/// Updated incrementally as heartbeats arrive (via the SignalR hub), not just once at logout.
/// </summary>
public class ActivityScore
{
    public int ActivityId { get; set; }

    /// <summary>One-to-one with AttendanceSession.</summary>
    public int AttendanceId { get; set; }
    public AttendanceSession AttendanceSession { get; set; } = null!;

    [Column(TypeName = "decimal(5,2)")]
    public decimal CompositeScore { get; set; } = 0m;

    public PresenceStatus PresenceStatus { get; set; } = PresenceStatus.Active;

    public DateTime ComputedAt { get; set; } = DateTime.UtcNow;

    // --- Running aggregates used to recompute CompositeScore on each heartbeat, without
    // needing to store every individual raw sample as its own row. ---

    public int TotalHeartbeats { get; set; } = 0;
    public int ActiveHeartbeats { get; set; } = 0;
    public int IdleBreachHeartbeats { get; set; } = 0; // heartbeats where idle gap exceeded threshold
    public long TotalKeystrokes { get; set; } = 0;
    public long TotalMouseEvents { get; set; } = 0;
}