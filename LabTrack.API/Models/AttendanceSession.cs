using System.ComponentModel.DataAnnotations;

namespace LabTrack.Api.Models;

/// <summary>
/// Records an individual student's login at a specific PC for a specific CourseSection.
/// It shows which workstation each student used and when. It does NOT credit CHED hours;
/// that happens at the SessionConfirmation level.
/// </summary>
public class AttendanceSession
{
    public int AttendanceId { get; set; }

    public string StudentId { get; set; } = string.Empty;
    public ApplicationUser Student { get; set; } = null!;

    public int WorkstationId { get; set; }
    public Workstation Workstation { get; set; } = null!;

    public int SectionId { get; set; }
    public CourseSection CourseSection { get; set; } = null!;

    public DateTime LoginTime { get; set; } = DateTime.UtcNow;

    /// <summary>Clarifying note added by the Lab Assistant or Custodian (e.g. changed workstation).</summary>
    [MaxLength(500)]
    public string? Notes { get; set; }
}