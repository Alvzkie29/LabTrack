using System.ComponentModel.DataAnnotations.Schema;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Models;

/// <summary>
/// One weekly missed-meetings reminder emailed to a class's faculty. Kept so a class gets at most
/// one reminder per week, even if the server restarts, and so staff can see what was sent.
/// </summary>
[Index(nameof(WeekStart), nameof(SectionId), IsUnique = true)]
public class ReminderLog
{
    public int ReminderLogId { get; set; }

    /// <summary>The Monday of the week the reminder belongs to.</summary>
    public DateOnly WeekStart { get; set; }

    public int SectionId { get; set; }

    [MaxLength(256)]
    public string ToEmail { get; set; } = string.Empty;

    /// <summary>The outstanding hours the reminder reported.</summary>
    [Column(TypeName = "decimal(6,2)")]
    public decimal OutstandingHours { get; set; }

    public DateTime SentAt { get; set; } = DateTime.UtcNow;

    /// <summary>Null when it was sent; the reason when sending failed (it is tried again on the next run).</summary>
    [MaxLength(500)]
    public string? Error { get; set; }
}
