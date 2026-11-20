using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace LabTrack.Api.Models;

/// <summary>
/// Why a class meeting has no confirmed session, as marked by the Laboratory Custodian or
/// Assistant on the class status grid ("No Teacher Around", "Fieldwork" and so on).
/// One row per class per date. "On-site" is never stored here: it comes from a session
/// confirmation, so the Faculty PIN stays the only way a session counts as held.
/// </summary>
[Index(nameof(SectionId), nameof(SessionDate), IsUnique = true)]
public class SessionStatus
{
    public int SessionStatusId { get; set; }

    public int SectionId { get; set; }

    [ForeignKey(nameof(SectionId))]
    public CourseSection CourseSection { get; set; } = null!;

    public DateOnly SessionDate { get; set; }

    /// <summary>One of <see cref="SessionStatuses.Manual"/>.</summary>
    [MaxLength(50)]
    public string Status { get; set; } = string.Empty;

    /// <summary>Required when Status is "Others".</summary>
    [MaxLength(300)]
    public string? Note { get; set; }

    /// <summary>The staff account that last marked it.</summary>
    public string? UpdatedBy { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>The status values of the Laboratory Management Office's monitoring sheet.</summary>
public static class SessionStatuses
{
    /// <summary>Shown for a meeting with a physical session confirmation. Never marked by hand.</summary>
    public const string OnSite = "On-site";

    /// <summary>Shown for a meeting covered by a virtual session. Not in the office's list, so never marked by hand.</summary>
    public const string Virtual = "Virtual";

    public const string NoTeacher = "No Teacher Around";
    public const string NoStudentsNoTeacher = "No Students and Teacher Around";
    public const string Others = "Others";

    /// <summary>The values staff may pick, in the order of the office's dropdown.</summary>
    public static readonly string[] Manual =
    {
        NoTeacher,
        NoStudentsNoTeacher,
        "Fieldwork",
        "Research Subject/OJT",
        "On Leave",
        Others
    };
}
