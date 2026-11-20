using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Models;

/// <summary>
/// An approved make-up class: one extra lab session of a class on a set date, time and laboratory,
/// recorded by the Custodian or a Lab Assistant with the approved request attached as proof.
/// During that time it works like a regular lab meeting: students log in on the PC Agent, the
/// faculty confirms with their PIN, and the hours count toward CHED compliance once finally confirmed.
/// One make-up per class per date.
/// </summary>
[Index(nameof(SectionId), nameof(Date), IsUnique = true)]
[Index(nameof(LabId), nameof(Date))]
public class MakeUpClass
{
    public int MakeUpId { get; set; }

    public int SectionId { get; set; }
    [ForeignKey(nameof(SectionId))]
    public CourseSection CourseSection { get; set; } = null!;

    public int LabId { get; set; }
    [ForeignKey(nameof(LabId))]
    public Laboratory Laboratory { get; set; } = null!;

    public DateOnly Date { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    /// <summary>Why the make-up is held, e.g. "Class missed on 11/11 (holiday)".</summary>
    [MaxLength(300)]
    public string? Reason { get; set; }

    /// <summary>The approved request as uploaded: its original file name, and the name it is stored under in App_Data.</summary>
    [MaxLength(200)]
    public string AttachmentName { get; set; } = string.Empty;
    [MaxLength(100)]
    public string AttachmentStoredName { get; set; } = string.Empty;
    [MaxLength(100)]
    public string AttachmentContentType { get; set; } = string.Empty;

    public string CreatedBy { get; set; } = string.Empty;
    [ForeignKey(nameof(CreatedBy))]
    public ApplicationUser CreatedByUser { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [NotMapped]
    public decimal Hours => (decimal)(EndTime - StartTime).TotalHours;
}
