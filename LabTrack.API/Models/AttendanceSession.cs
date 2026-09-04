using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LabTrack.Api.Models;

public enum ReviewOutcome
{
    Accepted = 0, // staff confirms this is a genuine session despite the low score
    Rejected = 1, // staff confirms this looks like a proxy login / invalid session
}

/// <summary>
/// The student/workstation-level layer of the two-layer tracking model. Records an individual
/// student's login at a specific PC for a specific CourseSection. This is a separate
/// utilization/attendance metric — it does NOT gate CHED-hour crediting, which happens
/// independently at the SessionConfirmation level.
/// </summary>
public class AttendanceSession
{
    public int AttendanceId { get; set; }

    public string StudentId { get; set; } = string.Empty;
    public ApplicationUser Student { get; set; } = null!;

    public int WorkstationId { get; set; }
    public Workstation Workstation { get; set; } = null!;

    public int SectionId { get; set; }
    public CourseSection CourseSection { get; set; } = null!;

    public DateTime LoginTime { get; set; } = DateTime.UtcNow;
    public DateTime? LogoutTime { get; set; }

    public ActivityScore? ActivityScore { get; set; }

    // --- Human review of a flagged session (Custodian/Administrator action) ---
    public bool IsReviewed { get; set; } = false;
    public ReviewOutcome? ReviewOutcome { get; set; }

    public string? ReviewedByUserId { get; set; }
    public ApplicationUser? ReviewedByUser { get; set; }

    public DateTime? ReviewedAt { get; set; }

    [MaxLength(500)]
    public string? ReviewNotes { get; set; }
}