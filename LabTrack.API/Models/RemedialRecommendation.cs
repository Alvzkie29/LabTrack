using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LabTrack.Api.Models;

/// <summary>
/// Auto-generated suggestion when a CourseSection is falling behind on required hours.
/// Derived from the gap between ChedComplianceProgress.ConfirmedHoursTotal and RequiredHours —
/// typically (re)generated whenever compliance status moves to AtRisk or NonCompliant.
/// </summary>
public class RemedialRecommendation
{
    public int RecommendationId { get; set; }

    public int SectionId { get; set; }
    public CourseSection CourseSection { get; set; } = null!;

    /// <summary>Hours still needed to reach the subject's required hours at generation time.</summary>
    [Column(TypeName = "decimal(6,2)")]
    public decimal HourDeficit { get; set; }

    /// <summary>Suggested number of additional sessions needed to close the deficit, given the section's HoursPerSession.</summary>
    public int AdditionalSessionsNeeded { get; set; }

    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
}