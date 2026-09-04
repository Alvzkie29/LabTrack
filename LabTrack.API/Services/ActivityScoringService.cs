using LabTrack.Api.Models;

namespace LabTrack.Api.Services;

public class HeartbeatInput
{
    public int KeystrokeCount { get; set; }
    public int MouseEventCount { get; set; }
    public int IdleSeconds { get; set; }
}

/// <summary>
/// Implements the composite activity scoring algorithm (Eqs. 1-6, section 2.2.2 of the paper).
/// Called incrementally on each heartbeat rather than on a full sample set, updating the running
/// aggregate counters on ActivityScore and recomputing CompositeScore/PresenceStatus from them.
/// Used for proxy-login prevention and utilization metrics only — never affects CHED-hour
/// crediting, which happens independently via SessionConfirmation.
/// </summary>
public class ActivityScoringService
{
    // Weight configuration — tune to match the paper's finalized coefficients.
    private const decimal WeightPresence = 0.5m;   // fraction of heartbeats marked active
    private const decimal WeightInputRate = 0.3m;  // normalized keystroke+mouse rate
    private const decimal WeightContinuity = 0.2m; // penalizes long idle-gap heartbeats

    private const int IdleThresholdSeconds = 120;   // beyond this, a heartbeat counts as an idle breach
    private const int ExpectedEventsPerHeartbeat = 30; // assumed input volume for "full" activity
    private const decimal FlagThreshold = 40m;       // composite score below this => Flagged

    /// <summary>Applies one heartbeat's telemetry to the running aggregates and recomputes the score in place.</summary>
    public void ApplyHeartbeat(ActivityScore score, HeartbeatInput input)
    {
        var wasActive = input.IdleSeconds < IdleThresholdSeconds && (input.KeystrokeCount + input.MouseEventCount) > 0;

        score.TotalHeartbeats += 1;
        if (wasActive) score.ActiveHeartbeats += 1;
        if (input.IdleSeconds > IdleThresholdSeconds) score.IdleBreachHeartbeats += 1;
        score.TotalKeystrokes += input.KeystrokeCount;
        score.TotalMouseEvents += input.MouseEventCount;

        Recompute(score);
    }

    /// <summary>Recomputes CompositeScore and PresenceStatus from the current running aggregates (Eq. 6).</summary>
    public void Recompute(ActivityScore score)
    {
        if (score.TotalHeartbeats == 0)
        {
            score.CompositeScore = 0m;
            score.PresenceStatus = PresenceStatus.Idle;
            score.ComputedAt = DateTime.UtcNow;
            return;
        }

        // Eq. 1: Presence ratio = active heartbeats / total heartbeats
        var presenceRatio = (decimal)score.ActiveHeartbeats / score.TotalHeartbeats;

        // Eq. 2-3: Normalized input rate, capped at 1.0
        var avgEventsPerHeartbeat = (decimal)(score.TotalKeystrokes + score.TotalMouseEvents) / score.TotalHeartbeats;
        var inputRate = Math.Min(1.0m, avgEventsPerHeartbeat / ExpectedEventsPerHeartbeat);

        // Eq. 4-5: Continuity — penalize the fraction of heartbeats with long idle gaps
        var continuity = 1.0m - (decimal)score.IdleBreachHeartbeats / score.TotalHeartbeats;

        // Eq. 6: Weighted composite, 0-100 scale
        var composite = (presenceRatio * WeightPresence + inputRate * WeightInputRate + continuity * WeightContinuity) * 100m;
        score.CompositeScore = Math.Round(Math.Clamp(composite, 0m, 100m), 2);

        score.PresenceStatus = score.CompositeScore < FlagThreshold
            ? PresenceStatus.Flagged
            : presenceRatio >= 0.5m ? PresenceStatus.Active : PresenceStatus.Idle;

        score.ComputedAt = DateTime.UtcNow;
    }
}