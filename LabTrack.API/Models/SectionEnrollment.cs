namespace LabTrack.Api.Models;

/// <summary>One row per student on a section's class list (roster).</summary>
public class SectionEnrollment
{
    public int EnrollmentId { get; set; }

    public int SectionId { get; set; }
    public CourseSection CourseSection { get; set; } = null!;

    public string StudentId { get; set; } = string.Empty;
    public ApplicationUser Student { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}