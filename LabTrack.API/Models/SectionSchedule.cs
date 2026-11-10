using System.ComponentModel.DataAnnotations;

namespace LabTrack.Api.Models;

/// <summary>
/// One lab meeting of a course section: the day, time and laboratory. A class usually has two
/// per week, and they can be in different laboratories.
/// </summary>
public class SectionSchedule
{
    public int ScheduleId { get; set; }

    public int SectionId { get; set; }
    public CourseSection CourseSection { get; set; } = null!;

    public int LabId { get; set; }
    public Laboratory Laboratory { get; set; } = null!;

    [MaxLength(10)]
    public string DayOfWeek { get; set; } = string.Empty; // e.g. "Monday"

    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
}