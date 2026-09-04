using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LabTrack.Api.Models;

/// <summary>
/// The class/session-level layer of the two-layer tracking model. A Lab Assistant's
/// attendance-logging act IS this confirmation step (a Custodian can also confirm directly).
/// Creating a row here immediately credits HoursCredited toward the section's CHED compliance —
/// independent of, and not gated by, individual student workstation activity (Attendance
/// Sessions / Activity Scores are a separate layer entirely).
/// </summary>
public class SessionConfirmation
{
    public int ConfirmationId { get; set; }

    public int SectionId { get; set; }
    public CourseSection CourseSection { get; set; } = null!;

    /// <summary>The Lab Assistant or Custodian who confirmed this session took place.</summary>
    public string ConfirmedBy { get; set; } = string.Empty;
    public ApplicationUser ConfirmedByUser { get; set; } = null!;

    /// <summary>The calendar date the confirmed session took place.</summary>
    public DateTime SessionDate { get; set; }

    /// <summary>
    /// Fixed hour value credited by this confirmation (typically copied from a per-subject or
    /// per-section default at creation time, e.g. 2.0 hours per meeting).
    /// </summary>
    [Column(TypeName = "decimal(5,2)")]
    public decimal HoursCredited { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}