using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LabTrack.Api.Models;

public enum ComplianceStatus
{
    Compliant = 0,
    AtRisk = 1,
    NonCompliant = 2
}

/// <summary>
/// Rollup/progress table, one row per CourseSection. Recomputed/updated whenever a
/// SessionConfirmation is created for that section — this is what powers the compliance
/// dashboard and at-risk views without needing to re-aggregate SessionConfirmations on every read.
/// </summary>
public class ChedComplianceProgress
{
    public int ProgressId { get; set; }

    /// <summary>One-to-one with CourseSection.</summary>
    public int SectionId { get; set; }
    public CourseSection CourseSection { get; set; } = null!;

    [Column(TypeName = "decimal(6,2)")]
    public decimal ConfirmedHoursTotal { get; set; } = 0m;

    /// <summary>Snapshot of the subject's required hours at time of last update.</summary>
    [Column(TypeName = "decimal(6,2)")]
    public decimal RequiredHours { get; set; }

    public ComplianceStatus Status { get; set; } = ComplianceStatus.NonCompliant;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Recomputes Status from ConfirmedHoursTotal vs RequiredHours (>=100% Compliant, >=75% AtRisk, else NonCompliant).</summary>
    public void RecomputeStatus()
    {
        if (RequiredHours <= 0)
        {
            Status = ComplianceStatus.Compliant;
            return;
        }

        var pct = ConfirmedHoursTotal / RequiredHours;
        Status = pct >= 1.0m ? ComplianceStatus.Compliant
            : pct >= 0.75m ? ComplianceStatus.AtRisk
            : ComplianceStatus.NonCompliant;
    }
}