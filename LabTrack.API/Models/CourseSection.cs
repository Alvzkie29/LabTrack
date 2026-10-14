using System.ComponentModel.DataAnnotations;

namespace LabTrack.Api.Models;

public class CourseSection
{
    public int SectionId { get; set; }

    public int SubjectId { get; set; }
    public Subject Subject { get; set; } = null!;

    [MaxLength(30)]
    public string SectionCode { get; set; } = string.Empty; // e.g. "IT211-CL2-T1"

    public int LabId { get; set; }
    public Laboratory Laboratory { get; set; } = null!;

    /// <summary>
    /// Nullable — faculty assignment is often finalized after sections are already created.
    /// A section with no instructor yet is still valid and schedulable; this can be filled in
    /// or changed later without needing to recreate the section.
    /// </summary>
    public string? FacultyId { get; set; }
    public ApplicationUser? Faculty { get; set; }

    /// <summary>Scheduled day of the week this section meets in the lab, e.g. "Monday".</summary>
    [MaxLength(10)]
    public string DayOfWeek { get; set; } = string.Empty;

    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    public int AyId { get; set; }
    public AcademicYear AcademicYear { get; set; } = null!;

    public ICollection<SessionConfirmation> SessionConfirmations { get; set; } = new List<SessionConfirmation>();
    public ICollection<AttendanceSession> AttendanceSessions { get; set; } = new List<AttendanceSession>();

    /// <summary>True once an instructor has been assigned — useful for "pending assignment" views.</summary>
    public bool HasInstructorAssigned => FacultyId is not null;
}