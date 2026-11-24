namespace LabTrack.Api.Services;

/// <summary>The same attendance window is used for suggestions and confirmation.</summary>
public sealed record AgentSessionEligibility(bool IsEnrolled, bool CanConfirm, string Status, string Message)
{
    public const int EarlyGraceMinutes = 15;

    public static AgentSessionEligibility Evaluate(bool isEnrolled, DateTime localNow, TimeOnly start, TimeOnly end)
    {
        if (!isEnrolled)
            return new(false, false, "not-enrolled", "Not assigned to you. You are not on this class list.");

        var startsAt = localNow.Date.Add(start.ToTimeSpan());
        var endsAt = localNow.Date.Add(end.ToTimeSpan());
        if (endsAt <= startsAt)
            return new(true, false, "ended", "This session has no valid attendance window. Please contact laboratory staff.");
        if (localNow < startsAt.AddMinutes(-EarlyGraceMinutes))
            return new(true, false, "upcoming", $"Not time for this session yet. Attendance opens at {startsAt.AddMinutes(-EarlyGraceMinutes):h:mm tt}.");
        if (localNow >= endsAt)
            return new(true, false, "ended", "This session has ended. Attendance is closed.");

        return new(true, true, "eligible", localNow < startsAt
            ? $"Your assigned session starts at {startsAt:h:mm tt}. You may confirm attendance now."
            : "Your assigned session. Attendance is open now.");
    }
}
