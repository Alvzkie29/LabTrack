using System.ComponentModel.DataAnnotations;

namespace LabTrack.Api.Models;

public class CourseSection
{
    public int SectionId { get; set; }

    public int SubjectId { get; set; }
    public Subject Subject { get; set; } = null!;

    [MaxLength(30)]
    public string SectionCode { get; set; } = string.Empty; // e.g. "IT211-CL2-T1"

    /// <summary>
    /// Nullable — faculty assignment is often finalized after sections are already created.
    /// A section with no instructor yet is still valid and schedulable; this can be filled in
    /// or changed later without needing to recreate the section.
    /// </summary>
    [MaxLength(150)]
    public string? InstructorName { get; set; }

    public int AyId { get; set; }
    public AcademicYear AcademicYear { get; set; } = null!;

    public ICollection<SessionConfirmation> SessionConfirmations { get; set; } = new List<SessionConfirmation>();
    public ICollection<AttendanceSession> AttendanceSessions { get; set; } = new List<AttendanceSession>();

    /// <summary>True once an instructor has been assigned — useful for "pending assignment" views.</summary>
    public bool HasInstructorAssigned => !string.IsNullOrWhiteSpace(InstructorName);
}