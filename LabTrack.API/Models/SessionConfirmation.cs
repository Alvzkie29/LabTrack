using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LabTrack.Api.Models;

public enum SessionType
{
    Physical = 0,
    Virtual = 1
}

/// <summary>
/// Class-level confirmation that a scheduled laboratory session took place.
/// Physical sessions: Faculty confirms first (PIN-authenticated e-signature), then a Lab
/// Assistant or Custodian gives final confirmation. Virtual sessions: entered by the
/// Assistant/Custodian (manual or CSV), so the faculty fields stay null.
/// Hours count toward CHED compliance only once FinalConfirmedAt is set.
/// </summary>
public class SessionConfirmation
{
    public int ConfirmationId { get; set; }

    public int SectionId { get; set; }
    public CourseSection CourseSection { get; set; } = null!;

    public SessionType SessionType { get; set; } = SessionType.Physical;

    /// <summary>The calendar date the session took place.</summary>
    public DateTime SessionDate { get; set; }

    // Step 1 (physical sessions only)
    public string? FacultyConfirmedBy { get; set; }
    public ApplicationUser? FacultyConfirmedByUser { get; set; }
    public DateTime? FacultyConfirmedAt { get; set; }

    // Step 2: the sole trigger for crediting hours
    public string? FinalConfirmedBy { get; set; }
    public ApplicationUser? FinalConfirmedByUser { get; set; }
    public DateTime? FinalConfirmedAt { get; set; }

    [Column(TypeName = "decimal(5,2)")]
    public decimal HoursCredited { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool IsFinalConfirmed => FinalConfirmedAt is not null;
}