using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LabTrack.Api.Models;

public enum TermType
{
    FirstSemester = 0,
    SecondSemester = 1,
    Summer = 2
}

public class AcademicYear
{
    public int AyId { get; set; }

    /// <summary>Display label, e.g. "2026-2027".</summary>
    [MaxLength(20)]
    public string Label { get; set; } = string.Empty;

    public TermType TermType { get; set; }

    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }

    /// <summary>Only one Academic Year should be active at a time; used to scope current-term views.</summary>
    public bool IsActive { get; set; } = false;

    public ICollection<CourseSection> CourseSections { get; set; } = new List<CourseSection>();
}

public class Subject
{
    public int SubjectId { get; set; }

    [MaxLength(20)]
    public string Code { get; set; } = string.Empty; // e.g. "IT211"

    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public int Units { get; set; }

    /// <summary>CHED-mandated total lab hours required for this subject.</summary>
    [Column(TypeName = "decimal(6,2)")]
    public decimal RequiredHours { get; set; }

    /// <summary>Number of weeks the term runs, used to derive expected session cadence.</summary>
    public int TermWeeks { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<CourseSection> CourseSections { get; set; } = new List<CourseSection>();
}