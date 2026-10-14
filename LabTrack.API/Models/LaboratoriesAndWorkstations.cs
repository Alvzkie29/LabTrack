using System.ComponentModel.DataAnnotations;

namespace LabTrack.Api.Models;

public class Laboratory
{
    public int LabId { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(20)]
    public string RoomCode { get; set; } = string.Empty; // e.g. "CL1"

    public int Capacity { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<Workstation> Workstations { get; set; } = new List<Workstation>();
    public ICollection<CourseSection> CourseSections { get; set; } = new List<CourseSection>();
}

public class Workstation
{
    public int WorkstationId { get; set; }

    public int LabId { get; set; }
    public Laboratory Laboratory { get; set; } = null!;

    /// <summary>
    /// Fixed application-level PC ID (e.g. "CL1-PC07"), written into each agent's config
    /// file at install time. This is what the agent sends on login so the server knows
    /// which physical PC the attendance came from.
    /// </summary>
    [MaxLength(100)]
    public string PcIdentifier { get; set; } = string.Empty;

    /// <summary>Human-readable seat label (e.g. "A1", "Row2-Seat7").</summary>
    [MaxLength(20)]
    public string SeatLabel { get; set; } = string.Empty;

    /// <summary>False for decommissioned or removed workstations.</summary>
    public bool IsActive { get; set; } = true;

    public ICollection<AttendanceSession> AttendanceSessions { get; set; } = new List<AttendanceSession>();
}