using System.ComponentModel.DataAnnotations;

namespace LabTrack.Api.Models;

public class CourseSection
{
    public int SectionId { get; set; }

    public int SubjectId { get; set; }
    public Subject Subject { get; set; } = null!;

    /// <summary>The university's class code, e.g. "3494". Unique within an academic year.</summary>
    [MaxLength(30)]
    public string SectionCode { get; set; } = string.Empty;
    [MaxLength(30)]
    public string? LectureRoom { get; set; }

    /// <summary>
    /// For a term subject, the half of the semester the class runs in: 1 (1st term) or 2 (2nd term).
    /// Null for a semestral class, which runs the whole semester. Set from the lab schedule's Term column.
    /// </summary>
    public int? TermPart { get; set; }

    /// <summary>Nullable: the instructor is often assigned after the class exists.</summary>
    public string? FacultyId { get; set; }
    public ApplicationUser? Faculty { get; set; }

    public int AyId { get; set; }
    public AcademicYear AcademicYear { get; set; } = null!;

    /// <summary>The lab meetings of this class (usually two a week, possibly in different labs).</summary>
    public ICollection<SectionSchedule> Schedules { get; set; } = new List<SectionSchedule>();
    public ICollection<SectionEnrollment> Enrollments { get; set; } = new List<SectionEnrollment>();
    public ICollection<SessionConfirmation> SessionConfirmations { get; set; } = new List<SessionConfirmation>();
    public ICollection<AttendanceSession> AttendanceSessions { get; set; } = new List<AttendanceSession>();
    public ICollection<MakeUpClass> MakeUpClasses { get; set; } = new List<MakeUpClass>();

    public bool HasInstructorAssigned => FacultyId is not null;
}